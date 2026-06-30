/**
 * Map pin colors by property status (and the selected highlight). These are the brand-sanctioned
 * categorical hex values documented in design-guidelines.md (Deal/Transaction palette) — the single
 * source of truth shared by the map markers and the map legend.
 */
export const PIN_COLORS = {
    inRenovation: '#69C9E1',
    onMarket: '#22C55E',
    sold: '#FF0000',
    wholesale: '#9333EA',
    selected: '#FFA500',
} as const;

/** Legend rows: the color → meaning key shown over the map. */
export const MAP_LEGEND_ITEMS: readonly { label: string; color: string }[] = [
    { label: 'In Renovation', color: PIN_COLORS.inRenovation },
    { label: 'On Market', color: PIN_COLORS.onMarket },
    { label: 'Sold', color: PIN_COLORS.sold },
    { label: 'Wholesale', color: PIN_COLORS.wholesale },
    { label: 'Selected', color: PIN_COLORS.selected },
];
