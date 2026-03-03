/**
 * When multiple Arms Length transactions share the same recording_date (e.g. same-day flip),
 * we need "latest" to be the deed that made the current owner the owner — i.e. the tx whose
 * buyer is not the seller in any other same-day tx ("chain end"). This reorders so that
 * within each same recording_date group, the chain-end transaction comes first.
 */
export type TxLike = {
  recordingDate: Date | string | null;
  buyerId?: string | null;
  buyerName?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  [k: string]: unknown;
};

function toDateKey(d: Date | string | null | undefined): string {
  if (d == null) return "";
  if (typeof d === "string") return d.split("T")[0] ?? d;
  return (d as Date).toISOString().split("T")[0] ?? "";
}

function nameKey(s: string | null | undefined): string {
  return s != null ? String(s).trim().toLowerCase() : "";
}

export function orderArmsLengthTransactions<T extends TxLike>(txs: T[]): T[] {
  if (txs.length === 0) return [];
  const result: T[] = [];
  let i = 0;
  while (i < txs.length) {
    const dateKey = toDateKey(txs[i].recordingDate);
    const sameDay: T[] = [];
    while (i < txs.length && toDateKey(txs[i].recordingDate) === dateKey) {
      sameDay.push(txs[i]);
      i++;
    }
    const sellerKeysThisDay = new Set<string>();
    for (const tx of sameDay) {
      const sid = tx.sellerId != null ? String(tx.sellerId).trim().toLowerCase() : "";
      const sname = nameKey(tx.sellerName);
      if (sid) sellerKeysThisDay.add(sid);
      if (sname) sellerKeysThisDay.add(sname);
    }
    const buyerIsSeller = (tx: T): boolean => {
      const bid = tx.buyerId != null ? String(tx.buyerId).trim().toLowerCase() : "";
      const bname = nameKey(tx.buyerName);
      return Boolean(
        (bid && sellerKeysThisDay.has(bid)) || (bname && sellerKeysThisDay.has(bname))
      );
    };
    const chainEnd = sameDay.find((tx) => !buyerIsSeller(tx));
    const rest = chainEnd != null ? sameDay.filter((tx) => tx !== chainEnd) : sameDay;
    if (chainEnd != null) result.push(chainEnd);
    result.push(...rest);
  }
  return result;
}
