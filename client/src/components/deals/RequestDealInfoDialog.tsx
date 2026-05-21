import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";

type RequestDealInfoDialogProps = {
    open: boolean;
    address: string;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export default function RequestDealInfoDialog({
    open,
    address,
    isLoading,
    onClose,
    onConfirm,
}: RequestDealInfoDialogProps) {
    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-sm">
            <ConfirmationContent
                onClose={onClose}
                onConfirm={onConfirm}
                title="Request More Info"
                description={`Request more information about ${address}?`}
                confirmText="Send Request"
                cancelText="Cancel"
                isLoading={isLoading}
            />
        </AppDialog>
    );
}
