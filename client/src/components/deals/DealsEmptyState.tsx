import type { LucideIcon } from 'lucide-react';
import { Handshake } from 'lucide-react';
import { cn } from '@/utils/merge';

type DealsEmptyStateProps = {
    icon?: LucideIcon;
    title: string;
    message?: string;
    /** Optional call to action (e.g. a "Post a deal" button) rendered below the message. */
    action?: React.ReactNode;
    className?: string;
};

/** A centered empty state that names what belongs here and points the way forward. */
export default function DealsEmptyState({
    icon: Icon = Handshake,
    title,
    message,
    action,
    className,
}: DealsEmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-4 px-6 py-16 text-center',
                className,
            )}
        >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Icon className="h-7 w-7 text-muted-foreground/70" strokeWidth={1.5} />
            </div>
            <div className="space-y-1.5">
                <p className="text-base font-semibold text-foreground">{title}</p>
                {message && (
                    <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                        {message}
                    </p>
                )}
            </div>
            {action}
        </div>
    );
}
