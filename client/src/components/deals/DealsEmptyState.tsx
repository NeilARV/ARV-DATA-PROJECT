import { Handshake } from 'lucide-react';

type DealsEmptyStateProps = {
    size?: 'sm' | 'lg';
    message: string;
    subMessage?: string;
};

export default function DealsEmptyState({
    size = 'lg',
    message,
    subMessage,
}: DealsEmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Handshake
                className={
                    size === 'lg'
                        ? 'w-16 h-16 text-muted-foreground/30'
                        : 'w-10 h-10 text-muted-foreground/30'
                }
            />
            <p
                className={
                    size === 'lg'
                        ? 'text-xl font-medium text-muted-foreground'
                        : 'text-sm text-muted-foreground'
                }
            >
                {message}
            </p>
            {subMessage && <p className="text-sm text-muted-foreground/60">{subMessage}</p>}
        </div>
    );
}
