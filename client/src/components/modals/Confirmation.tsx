import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { ConfirmationDialogProps } from '@/types/modals';

type ConfirmationContentProps = Omit<ConfirmationDialogProps, 'open' | 'onClose'> & {
    onClose: () => void;
};

export default function ConfirmationContent({
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Yes',
    cancelText = 'No',
    variant = 'default',
    isLoading = false,
}: ConfirmationContentProps) {
    return (
        <>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1"
                    disabled={isLoading}
                    data-testid="button-confirm-cancel"
                    size="lg"
                >
                    {cancelText}
                </Button>
                <Button
                    variant={variant}
                    onClick={onConfirm}
                    className="flex-1"
                    disabled={isLoading}
                    data-testid="button-confirm-ok"
                    size="lg"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {confirmText}
                        </>
                    ) : (
                        confirmText
                    )}
                </Button>
            </div>
        </>
    );
}
