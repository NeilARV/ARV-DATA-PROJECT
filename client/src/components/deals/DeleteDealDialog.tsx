import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';

type DeleteDealDialogProps = {
    open: boolean;
    address: string;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export default function DeleteDealDialog({
    open,
    address,
    isLoading,
    onClose,
    onConfirm,
}: DeleteDealDialogProps) {
    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-sm">
            <ConfirmationContent
                onClose={onClose}
                onConfirm={onConfirm}
                title="Delete Deal"
                description={`Remove "${address}" from the deal feed? This cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                variant="destructive"
                isLoading={isLoading}
            />
        </AppDialog>
    );
}
