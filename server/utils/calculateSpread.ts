type Spread = {
    buyerPurchasePrice: number;
    sellerPurchasePrice: number;
}

export function calculateSpread({ buyerPurchasePrice, sellerPurchasePrice }: Spread): number {
    return sellerPurchasePrice - buyerPurchasePrice;
}