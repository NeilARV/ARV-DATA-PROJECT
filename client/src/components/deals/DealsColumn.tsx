import type { ReactNode } from 'react';
import DealsEmptyState from '@/components/deals/DealsEmptyState';

type DealsColumnProps = {
    title: string;
    count: number;
    children: ReactNode;
    isEmpty: boolean;
    borderRight?: boolean;
};

export default function DealsColumn({
    title,
    count,
    children,
    isEmpty,
    borderRight = false,
}: DealsColumnProps) {
    return (
        <div
            className={`flex-1 flex flex-col overflow-hidden min-w-0 ${borderRight ? '2xl:border-r border-border' : ''}`}
        >
            {/* Independently scrolling body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
                <h3 className="text-base font-semibold text-foreground mb-4">
                    {title}
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                        ({count})
                    </span>
                </h3>
                {isEmpty ? (
                    <DealsEmptyState size="sm" message={`No ${title.toLowerCase()}`} />
                ) : (
                    <div className="space-y-4">{children}</div>
                )}
            </div>
        </div>
    );
}
