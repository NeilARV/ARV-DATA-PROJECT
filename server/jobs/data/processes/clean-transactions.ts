import { normalizeAddressForLookup, normalizeDateToYMD } from "server/utils/normalization";
import { isFlippingCompany } from "server/utils/dataSyncHelpers";
import type { BuyersMarketRecord } from "./fetch-market";
import type { CleanMarketResult } from "./clean-market";
import type { PropertyWithTransactions, TransactionRecord } from "./get-transactions";

export interface CleanTransactionsResult {
  companyNames: string[];
}

function getString(tx: TransactionRecord, ...keys: string[]): string {
  const r = tx as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Format address from buyer market record to match batch lookup key. */
function formatAddressFromRecord(record: BuyersMarketRecord): string {
  const address = (record.address as string) || "";
  const city = (record.city as string) || "";
  const state = (record.state as string) || "";
  const zipCode = (record.zipCode as string) || "";
  if (!address || !city || !state) return "";
  return zipCode
    ? `${address}, ${city}, ${state} ${zipCode}`
    : `${address}, ${city}, ${state}`;
}

/** Build address -> best buyer market record (latest recordingDate per address). */
function buildBuyerRecordByAddress(records: BuyersMarketRecord[]): {
  byAddress: Map<string, BuyersMarketRecord>;
  normalizedToCanonical: Map<string, string>;
} {
  const byAddress = new Map<string, BuyersMarketRecord>();
  const normalizedToCanonical = new Map<string, string>();

  for (const record of records) {
    const addr = formatAddressFromRecord(record);
    if (!addr) continue;

    const recordingDate = normalizeDateToYMD(record.recordingDate as string) || "";
    const existing = byAddress.get(addr);
    if (
      !existing ||
      recordingDate > (normalizeDateToYMD(existing.recordingDate as string) || "")
    ) {
      byAddress.set(addr, record);
    }

    const norm = normalizeAddressForLookup(addr);
    if (norm && !normalizedToCanonical.has(norm)) {
      normalizedToCanonical.set(norm, addr);
    }
  }
  return { byAddress, normalizedToCanonical };
}

function getPropertyAddress(property: PropertyWithTransactions): string {
  if (property.address && String(property.address).trim()) return property.address.trim();
  const p = property.property as Record<string, unknown>;
  const address = (p.address as string) || "";
  const city = (p.city as string) || "";
  const state = (p.state as string) || "";
  const zip = (p.zip as string) || (p.zipCode as string) || "";
  if (!address || !city || !state) return "";
  return zip ? `${address}, ${city}, ${state} ${zip}` : `${address}, ${city}, ${state}`;
}

/** Check if a transaction record matches the buyer market record (same sale). */
function transactionMatchesBuyerRecord(
  tx: TransactionRecord,
  record: BuyersMarketRecord,
  getStr: (tx: TransactionRecord, ...keys: string[]) => string
): boolean {
  const txRecDate = normalizeDateToYMD(getStr(tx, "RECORDING_DATE", "recording_date"));
  const txSaleDate = normalizeDateToYMD(getStr(tx, "SALE_DATE", "sale_date"));
  const recRecDate = normalizeDateToYMD(record.recordingDate as string);
  const recSaleDate = normalizeDateToYMD(record.saleDate as string);
  if (txRecDate !== recRecDate || txSaleDate !== recSaleDate) return false;

  const txBuyer = getStr(tx, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
  const txSeller = getStr(tx, "SELLER1_NAME", "seller1_name");
  const recBuyer = ((record.buyerName as string) || "").trim();
  const recSeller = ((record.sellerName as string) || "").trim();
  if (txBuyer !== recBuyer || txSeller !== recSeller) return false;

  const txAmt = (tx as Record<string, unknown>).SALE_AMT ?? (tx as Record<string, unknown>).sale_amt;
  const recValue = record.saleValue;
  if (txAmt != null && recValue != null) {
    const txNum = typeof txAmt === "number" ? txAmt : Number(String(txAmt).replace(/[^0-9.-]/g, ""));
    const recNum = typeof recValue === "number" ? recValue : Number(String(recValue).replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(txNum) && !Number.isNaN(recNum) && txNum !== recNum) return false;
  }
  return true;
}

/** Build a transaction record from a buyer market record (same shape as /property/transactions). */
function transactionFromBuyerRecord(record: BuyersMarketRecord): TransactionRecord {
  return {
    RECORDING_DATE: record.recordingDate ?? null,
    SALE_DATE: record.saleDate ?? null,
    BUYER_BORROWER1_NAME: record.buyerName ?? null,
    BUYER_BORROWER2_NAME: null,
    SELLER1_NAME: record.sellerName ?? null,
    SALE_AMT: record.saleValue ?? null,
    TRANSACTION_TYPE: "Arms Length",
    APN: null,
    FIRST_MTG_RECORDING_DATE: null,
    FIRST_MTG_AMT: null,
    FIRST_MTG_LENDER_NAME: null,
    FIRST_MTG_DUE_DATE: null,
  } as TransactionRecord;
}

/**
 * Ensures each property's transactions array includes the buyer sale from cleaned
 * market data. If the sale is already present (matched by recording date, buyer, seller),
 * does nothing; otherwise appends it so /property/transactions is up to date.
 */
function ensureBuyerTransactionInProperty(
  property: PropertyWithTransactions,
  buyerRecord: BuyersMarketRecord
): void {
  const alreadyExists = property.transactions.some((tx) =>
    transactionMatchesBuyerRecord(tx, buyerRecord, getString)
  );
  if (alreadyExists) return;

  const newTx = transactionFromBuyerRecord(buyerRecord);
  property.transactions.unshift(newTx);
}

/**
 * Cleans transactions: (1) ensures each property has the buyer sale from cleaned
 * market in its transactions array (adding it if missing); (2) collects all corporate
 * company names from transaction history for later insert.
 */
export function cleanTransactions(
  properties: PropertyWithTransactions[],
  cleaned: CleanMarketResult,
  cityCode: string
): CleanTransactionsResult {
  const { byAddress, normalizedToCanonical } = buildBuyerRecordByAddress(cleaned.records);

  for (const property of properties) {
    const address = getPropertyAddress(property);
    if (!address) continue;

    let buyerRecord = byAddress.get(address);
    if (!buyerRecord) {
      const norm = normalizeAddressForLookup(address);
      const canonical = norm ? normalizedToCanonical.get(norm) : null;
      buyerRecord = canonical ? byAddress.get(canonical) ?? undefined : undefined;
    }
    if (!buyerRecord) continue;

    ensureBuyerTransactionInProperty(property, buyerRecord);
  }

  const companyNamesSet = new Set<string>();
  for (const property of properties) {
    for (const tx of property.transactions) {
      const buyerName = getString(tx, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
      const sellerName = getString(tx, "SELLER1_NAME", "seller1_name");
      if (isFlippingCompany(buyerName, null)) companyNamesSet.add(buyerName);
      if (isFlippingCompany(sellerName, null)) companyNamesSet.add(sellerName);
    }
  }

  const companyArr = Array.from(companyNamesSet)
  console.log(`[${cityCode} SYNC] Companies from transactions (${companyArr.length})`);

  return {
    companyNames: companyArr,
  };
}
