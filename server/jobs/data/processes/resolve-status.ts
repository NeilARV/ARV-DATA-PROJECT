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

function getSaleDate(tx: Record<string, unknown>): string | null {
  const date = getString(tx, "SALE_DATE", "sale_date") || getString(tx, "RECORDING_DATE", "recording_date");
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
    .map((tx) => ({ tx, date: getSaleDate(tx as Record<string, unknown>) }))
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
 * When did the given party (seller on the most recent tx) acquire the property?
 * Returns the date of the most recent transaction where they were the buyer, excluding the current sale tx.
 */
function getWhenSellerBought(
  transactions: TransactionWithIds[],
  currentSellerId: string | null,
  currentSellerName: string,
  currentSaleDate: string,
  excludeTx: TransactionWithIds | null
): string | null {
  const salesDesc = getSalesChronologicalDesc(transactions);
  const acquisition = salesDesc.find((tx) => {
    if (tx === excludeTx) return false;
    const date = getSaleDate(tx as Record<string, unknown>);
    if (!date || date > currentSaleDate) return false;
    if (currentSellerId && tx.buyer_id === currentSellerId) return true;
    const txBuyer = getString(tx as Record<string, unknown>, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
    return !!currentSellerName && txBuyer === currentSellerName;
  });
  return acquisition ? getSaleDate(acquisition as Record<string, unknown>) : null;
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
 * Uses property-level buyer_id and seller_id (from current_sale) so status matches
 * what is stored on the property, not a different "most recent" transaction.
 *
 * 1. seller_id && !buyer_id → sold (company sold to non-company)
 * 2. !seller_id && buyer_id → in-renovation (company bought from non-company)
 * 3. !seller_id && !buyer_id → default sold
 * 4. seller_id && buyer_id → hold time ≤30 days → wholesale, else sold
 */
export function resolveStatus(properties: PropertyWithIds[], cityCode: string): PropertyWithStatus[] {
  return properties.map((item) => {
    const property = item.property as Record<string, unknown>;
    const listingStatus = getString(property, "listing_status", "listingStatus");
    const transactions = item.transactions ?? [];

    const mostRecent = getMostRecentSale(transactions);
    const currentSaleDate = mostRecent ? getSaleDate(mostRecent as Record<string, unknown>) : null;
    const currentBuyerId = (property.buyer_id as string) ?? null;
    const currentSellerId = (property.seller_id as string) ?? null;
    const currentSale = (property.current_sale as Record<string, unknown>) || {};
    const currentBuyerName = getString(currentSale, "buyer_1", "buyer_2") || (mostRecent ? getString(mostRecent as Record<string, unknown>, "BUYER_BORROWER1_NAME", "buyer_borrower1_name") : "");
    const currentSellerName = getString(currentSale, "seller_1", "seller_2") || (mostRecent ? getString(mostRecent as Record<string, unknown>, "SELLER1_NAME", "seller1_name") : "");

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
          status = daysHeld <= WHOLESALE_DAYS_THRESHOLD ? "wholesale" : "sold";
        } else {
          status = "sold";
        }
      }
    } else {
      status = "sold";
    }

    return {
      ...item,
      property: {
        ...property,
        status,
      } as PropertyWithIds["property"] & { status: PropertyStatus },
    };
  });
}
