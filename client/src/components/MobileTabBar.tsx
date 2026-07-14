import type { ReactNode } from 'react';

import { cn } from '@/utils/merge';

type MobileTab<T extends string> = {
    value: T;
    label: ReactNode;
};

// Full literal `<breakpoint>:hidden` strings (not interpolated) so Tailwind's content scanner
// emits each class. Same reason as Admin's TABS_GRID_COLS map.
const HIDE_AT_CLASS = {
    md: 'md:hidden',
    '2xl': '2xl:hidden',
} as const;

type MobileTabBarProps<T extends string> = {
    tabs: readonly MobileTab<NoInfer<T>>[];
    value: T;
    onChange: (value: NoInfer<T>) => void;
    /** Breakpoint at which the bar hides because the layout expands to show all panes at once. */
    hideAt?: keyof typeof HIDE_AT_CLASS;
};

/** Full-width segmented tab bar shown only below `hideAt`, where a multi-pane layout collapses to one pane. */
export function MobileTabBar<T extends string>({
    tabs,
    value,
    onChange,
    hideAt = 'md',
}: MobileTabBarProps<T>) {
    return (
        <div
            className={cn(
                HIDE_AT_CLASS[hideAt],
                'flex-shrink-0 flex border-b border-border bg-background',
            )}
        >
            {tabs.map((tab) => (
                <button
                    key={tab.value}
                    onClick={() => onChange(tab.value)}
                    className={cn(
                        'flex-1 py-2.5 text-sm font-medium transition-colors',
                        value === tab.value
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
