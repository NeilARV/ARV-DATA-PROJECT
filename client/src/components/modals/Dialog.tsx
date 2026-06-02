import {
    Dialog as RadixDialog,
    DialogContent,
    NoOverlayDialogContent,
} from '@/components/ui/dialog';
import { cn } from '@/utils/merge';

interface AppDialogProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** When true: hides close button, blocks outside-click and escape-key dismissal */
    forced?: boolean;
    /** Tailwind classes forwarded to DialogContent (use for sizing, overflow, etc.) */
    className?: string;
    /** When true: suppresses the backdrop overlay — use when this dialog opens on top of another dialog */
    hideOverlay?: boolean;
}

export default function AppDialog({
    open,
    onClose,
    children,
    forced = false,
    className,
    hideOverlay = false,
}: AppDialogProps) {
    const Content = hideOverlay ? NoOverlayDialogContent : DialogContent;
    return (
        <RadixDialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen && !forced) onClose();
            }}
        >
            <Content
                className={cn(forced && '[&>button]:hidden', className)}
                onPointerDownOutside={(e) => {
                    if (forced) e.preventDefault();
                }}
                onEscapeKeyDown={(e) => {
                    if (forced) e.preventDefault();
                }}
            >
                {children}
            </Content>
        </RadixDialog>
    );
}
