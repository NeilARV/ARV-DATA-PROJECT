import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/utils/merge';

const badgeVariants = cva(
    // Whitespace-nowrap: Badges should never wrap.
    'whitespace-nowrap inline-flex items-center rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2' +
        ' hover-elevate ',
    {
        variants: {
            variant: {
                default: 'border-transparent bg-primary text-primary-foreground shadow-xs',
                secondary: 'border-transparent bg-secondary text-secondary-foreground',
                destructive:
                    'border-transparent bg-destructive text-destructive-foreground shadow-xs',
                outline: 'border [border-color:var(--badge-outline)] shadow-xs',
                cyan: 'border-transparent bg-[#69C9E1] text-white shadow-xs',
                green: 'border-transparent bg-[#22C55E] text-white shadow-xs',
                red: 'border-transparent bg-[#FF0000] text-white shadow-xs',
                purple: 'border-transparent bg-[#9333EA] text-white shadow-xs',
                orange: 'border-transparent bg-[#F97316] text-white shadow-xs',
                white: 'border-transparent bg-white text-black shadow-xs',
            },
            size: {
                sm: 'text-xs font-semibold px-2 py-0.5',
                default: 'text-xs px-2.5 py-0.5 font-semibold',
                lg: 'text-xs font-semibold px-3 py-0.5',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
    onRemove?: () => void;
    removeLabel?: string;
}

function Badge({
    className,
    variant,
    size,
    onRemove,
    removeLabel,
    children,
    ...props
}: BadgeProps) {
    return (
        <div
            className={cn(
                badgeVariants({ variant, size }),
                onRemove && 'gap-0.5 pr-0.5',
                className,
            )}
            {...props}
        >
            {children}
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="h-4 w-4 rounded-full inline-flex items-center justify-center hover:bg-black/20 dark:hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                    aria-label={removeLabel ?? 'Remove'}
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

export { Badge, badgeVariants };
