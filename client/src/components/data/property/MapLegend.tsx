import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MAP_LEGEND_ITEMS } from '@/constants/mapPins.constants';

/**
 * Color key for the property map pins. Collapsible so it never blocks the map on small screens.
 * Rendered as an absolutely-positioned overlay by PropertyMap.
 */
export function MapLegend() {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="absolute bottom-6 right-2 z-[500] rounded-md border border-border bg-background/90 backdrop-blur-sm text-xs">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 font-medium text-foreground hover-elevate rounded-md"
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Collapse map legend' : 'Expand map legend'}
            >
                <span>Legend</span>
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>
            {isOpen && (
                <ul className="flex flex-col gap-1 px-2.5 pb-2">
                    {MAP_LEGEND_ITEMS.map((item) => (
                        <li key={item.label} className="flex items-center gap-1.5">
                            <span
                                className="inline-block w-2.5 h-2.5 rounded-full border border-border"
                                style={{ backgroundColor: item.color }}
                            />
                            <span className="text-muted-foreground">{item.label}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
