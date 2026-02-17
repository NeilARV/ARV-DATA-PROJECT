import { isFlippingCompany } from "server/utils/dataSyncHelpers";
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

/**
 * Collects all corporate company names from property transaction history.
 * Uses BUYER_BORROWER1_NAME and SELLER1_NAME (or camelCase variants); only
 * names that pass isFlippingCompany (e.g. LLC, Corp, Ltd, not trusts) are added.
 */
export function cleanTransactions(
  properties: PropertyWithTransactions[]
): CleanTransactionsResult {
  const companyNamesSet = new Set<string>();

  for (const property of properties) {
    for (const tx of property.transactions) {
      const buyerName = getString(
        tx,
        "BUYER_BORROWER1_NAME",
        "buyer_borrower1_name"
      );
      const sellerName = getString(tx, "SELLER1_NAME", "seller1_name");

      if (isFlippingCompany(buyerName, null)) companyNamesSet.add(buyerName);
      if (isFlippingCompany(sellerName, null)) companyNamesSet.add(sellerName);
    }
  }

  return {
    companyNames: Array.from(companyNamesSet),
  };
}
