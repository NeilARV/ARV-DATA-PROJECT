import {
  normalizeCountyName,
  trimCompanyName,
} from "server/utils/normalization";
import { isFlippingCompany } from "server/utils/dataSyncHelpers";
import type { PropertyWithTransactions, TransactionRecord } from "./get-transactions";

export interface CleanTransactionsResult {
  companyNames: string[];
  /** Map of company name (as stored, trimmed SFR) -> counties they own properties in (for company county array updates). */
  companyCounties: Record<string, string[]>;
}

function getString(tx: TransactionRecord, ...keys: string[]): string {
  const r = tx as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Get normalized county from property (batch lookup returns county on property). */
function getPropertyCounty(property: PropertyWithTransactions): string | null {
  const p = property.property as Record<string, unknown>;
  const county = (p.county as string) || "";
  return normalizeCountyName(county) || null;
}

/**
 * Collects all corporate company names from transaction history for later insert.
 * SFR's /properties/transactions endpoint is guaranteed to be up to date, so
 * no synthetic transaction injection is needed.
 */
export function cleanTransactions(
  properties: PropertyWithTransactions[],
  cityCode: string
): CleanTransactionsResult {
  const companyNamesSet = new Set<string>();
  /** company name (trimmed SFR) -> Set of counties (same key insert-companies uses for lookups). */
  const companyToCountiesMap = new Map<string, Set<string>>();

  for (const property of properties) {
    const county = getPropertyCounty(property);

    for (const tx of property.transactions) {
      const buyerName = getString(tx, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
      const sellerName = getString(tx, "SELLER1_NAME", "seller1_name");

      if (isFlippingCompany(buyerName, null)) {
        const name = trimCompanyName(buyerName);
        if (name) {
          companyNamesSet.add(name);
          if (county) {
            if (!companyToCountiesMap.has(name)) companyToCountiesMap.set(name, new Set());
            companyToCountiesMap.get(name)!.add(county);
          }
        }
      }
      if (isFlippingCompany(sellerName, null)) {
        const name = trimCompanyName(sellerName);
        if (name) {
          companyNamesSet.add(name);
          if (county) {
            if (!companyToCountiesMap.has(name)) companyToCountiesMap.set(name, new Set());
            companyToCountiesMap.get(name)!.add(county);
          }
        }
      }
    }
  }

  const companyArr = Array.from(companyNamesSet);
  const companyCounties: Record<string, string[]> = Object.fromEntries(
    Array.from(companyToCountiesMap.entries()).map(([k, set]) => [k, Array.from(set)])
  );
  console.log(`[${cityCode} SYNC] Companies from transactions (${companyArr.length}), with county data for ${Object.keys(companyCounties).length} companies`);

  return {
    companyNames: companyArr,
    companyCounties,
  };
}
