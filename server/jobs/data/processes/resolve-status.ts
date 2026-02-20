import { normalizeDateToYMD } from "server/utils/normalization";
import type { PropertyWithIds } from "./resolve-ids";
import type { TransactionWithIds } from "./resolve-ids";

export type PropertyStatus = "on-market" | "in-renovation" | "sold" | "wholesale";

export interface PropertyWithStatus extends PropertyWithIds {
  property: PropertyWithIds["property"] & { status: PropertyStatus };
}

const ON_MARKET = "On Market";
const OFF_MARKET = "Off Market";
const WHOLESALE_DAYS_THRESHOLD = 30;

function getString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function getRecordingDate(tx: Record<string, unknown>): string | null {
  const date = getString(tx, "RECORDING_DATE", "recording_date");
  return date ? normalizeDateToYMD(date) : null;
}

/** True if the transaction looks like a deed sale (has buyer and seller), not a REFI/HELOC. */
function isDeedSale(tx: Record<string, unknown>): boolean {
  const buyer = getString(tx, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
  const seller = getString(tx, "SELLER1_NAME", "seller1_name");
  return !!(buyer && seller);
}

/**
 * Sale-like transactions (deed sales only) sorted by sale date descending.
 * For same-day transactions: the "resale" (seller was buyer in another same-day tx) is treated
 * as more recent so we pick the actual most recent event (company bought then sold same day → wholesale).
 */
function getSalesChronologicalDesc(transactions: TransactionWithIds[]): TransactionWithIds[] {
  const withMeta = transactions
    .filter((tx) => isDeedSale(tx as Record<string, unknown>))
    .map((tx) => ({ tx, date: getRecordingDate(tx as Record<string, unknown>) }))
    .filter((m): m is { tx: TransactionWithIds; date: string } => m.date != null);
  if (withMeta.length === 0) return [];

  withMeta.sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    // Same day: put the "resale" first (tx where seller is buyer in another same-day tx)
    const aTx = a.tx as TransactionWithIds & Record<string, unknown>;
    const bTx = b.tx as TransactionWithIds & Record<string, unknown>;
    const sameDay = withMeta.filter((m) => m.date === a.date).map((m) => m.tx);
    const aIsResale = sameDay.some((t) => t !== a.tx && (t.buyer_id === aTx.seller_id || getString(t as Record<string, unknown>, "BUYER_BORROWER1_NAME") === getString(aTx, "SELLER1_NAME", "seller1_name")));
    const bIsResale = sameDay.some((t) => t !== b.tx && (t.buyer_id === bTx.seller_id || getString(t as Record<string, unknown>, "BUYER_BORROWER1_NAME") === getString(bTx, "SELLER1_NAME", "seller1_name")));
    if (aIsResale && !bIsResale) return -1;
    if (!aIsResale && bIsResale) return 1;
    return 0;
  });

  return withMeta.map(({ tx }) => tx);
}

/**
 * Most recent transaction (the sale that just happened). Uses sale date + same-day resale order.
 */
function getMostRecentSale(transactions: TransactionWithIds[]): TransactionWithIds | null {
  const sorted = getSalesChronologicalDesc(transactions);
  return sorted[0] ?? null;
}

/**
 * When did the seller (on the most recent tx) acquire? Uses RECORDING_DATE only.
 * Allows acquisition recorded up to WHOLESALE_DAYS_THRESHOLD days after the sale's
 * recording date so same-day flips are always found.
 */
function getWhenSellerBought(
  transactions: TransactionWithIds[],
  currentSellerId: string | null,
  currentSellerName: string,
  currentSaleRecordingDate: string,
  excludeTx: TransactionWithIds | null
): string | null {
  const salesDesc = getSalesChronologicalDesc(transactions);
  const cutoff = new Date(currentSaleRecordingDate);
  cutoff.setDate(cutoff.getDate() + WHOLESALE_DAYS_THRESHOLD);
  const cutoffYMD = cutoff.toISOString().split("T")[0];
  const acquisition = salesDesc.find((tx) => {
    if (tx === excludeTx) return false;
    const recDate = getRecordingDate(tx as Record<string, unknown>);
    if (!recDate || recDate > cutoffYMD) return false;
    if (currentSellerId && tx.buyer_id === currentSellerId) return true;
    const txBuyer = getString(tx as Record<string, unknown>, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
    return !!currentSellerName && txBuyer === currentSellerName;
  });
  return acquisition ? getRecordingDate(acquisition as Record<string, unknown>) : null;
}

/**
 * Resolves status for each property: on-market | in-renovation | sold | wholesale.
 *
 * On Market → on-market.
 *
 * Off Market: we use the **most recent transaction** (not property-level buyer/seller) to determine
 * current buyer and seller. Same-day flips (company bought then sold same day) are handled so the
 * resale is treated as the most recent event.
 *
 * Uses the most recent transaction (by RECORDING_DATE, resale first when same day) for
 * buyer_id/seller_id so flip status is correct. Property current_sale can be the purchase
 * that triggered the feed, which would wrongly give in-renovation.
 *
 * 1. seller_id && !buyer_id → sold (company sold to non-company)
 * 2. !seller_id && buyer_id → in-renovation (company bought from non-company)
 * 3. !seller_id && !buyer_id → default sold
 * 4. seller_id && buyer_id → hold time ≤30 days (by recording date) → wholesale, else in-renovation
 */
export function resolveStatus(properties: PropertyWithIds[], cityCode: string): PropertyWithStatus[] {
  return properties.map((item) => {
    const property = item.property as Record<string, unknown>;
    const listingStatus = getString(property, "listing_status", "listingStatus");
    const transactions = item.transactions ?? [];

    const mostRecent = getMostRecentSale(transactions);
    const mostRecentTx = mostRecent as (TransactionWithIds & Record<string, unknown>) | null;
    const currentSaleDate = mostRecent ? getRecordingDate(mostRecent as Record<string, unknown>) : null;
    // Use most recent tx's ids so we classify the flip (resale = SD VREV seller, ORCA buyer)
    const currentBuyerId = (mostRecentTx?.buyer_id as string) ?? (property.buyer_id as string) ?? null;
    const currentSellerId = (mostRecentTx?.seller_id as string) ?? (property.seller_id as string) ?? null;
    const currentSale = (property.current_sale as Record<string, unknown>) || {};
    const currentBuyerName = mostRecentTx ? getString(mostRecentTx, "BUYER_BORROWER1_NAME", "buyer_borrower1_name") : (getString(currentSale, "buyer_1", "buyer_2") || "");
    const currentSellerName = mostRecentTx ? getString(mostRecentTx, "SELLER1_NAME", "seller1_name") : (getString(currentSale, "seller_1", "seller_2") || "");

    const hasBuyerId = !!currentBuyerId;
    const hasSellerId = !!currentSellerId;

    let status: PropertyStatus;

    if (listingStatus === ON_MARKET) {
      status = "on-market";
    } else if (listingStatus === OFF_MARKET) {
      if (!currentSaleDate) {
        status = "sold";
      } else if (hasSellerId && !hasBuyerId) {
        status = "sold";
      } else if (!hasSellerId && hasBuyerId) {
        status = "in-renovation";
      } else if (!hasSellerId && !hasBuyerId) {
        // Default case that should not occur
        status = "sold";
      } else {
        // seller_id && buyer_id: how long did the current seller hold? (seller bought → then sold)
        const sellerBoughtDate = getWhenSellerBought(
          transactions,
          currentSellerId,
          currentSellerName,
          currentSaleDate,
          mostRecent
        );

        if (sellerBoughtDate) {
          const current = new Date(currentSaleDate).setHours(0, 0, 0, 0);
          const bought = new Date(sellerBoughtDate).setHours(0, 0, 0, 0);
          const daysHeld = Math.floor((current - bought) / (1000 * 60 * 60 * 24));
          status = daysHeld <= WHOLESALE_DAYS_THRESHOLD ? "wholesale" : "in-renovation";
        } else {
          status = "in-renovation";
        }
      }
    } else {
      status = "sold";
    }

    // Write back canonical buyer/seller from most recent transaction so DB and APIs show current owner
    const propertyOut = { ...property, status } as Record<string, unknown>;
    if (mostRecentTx) {
      propertyOut.buyer_id = currentBuyerId;
      propertyOut.seller_id = currentSellerId;
      const cs = (propertyOut.current_sale as Record<string, unknown>) || {};
      propertyOut.current_sale = {
        ...cs,
        buyer_1: currentBuyerName,
        seller_1: currentSellerName,
      };
    }

    return {
      ...item,
      property: propertyOut as PropertyWithIds["property"] & { status: PropertyStatus },
    };
  });
}
