import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

type RequestDealInfoDialogProps = {
    open: boolean;
    address: string;
    isLoading: boolean;
    succeeded: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export default function RequestDealInfoDialog({
    open,
    address,
    isLoading,
    succeeded,
    onClose,
    onConfirm,
}: RequestDealInfoDialogProps) {
    return (
        <AppDialog open={open} onClose={onClose} className="max-w-sm sm:max-w-lg lg:max-w-xl">
            {succeeded ? (
                <>
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <DialogTitle>Request Received</DialogTitle>
                        </div>
                        <DialogDescription>
                            A member of our team will reach out to you shortly with more details regarding {address}.
                        </DialogDescription>
                    </DialogHeader>
                    <Button variant="outline" onClick={onClose} className="w-full" size="lg">
                        Close
                    </Button>
                </>
            ) : (
                <ConfirmationContent
                    onClose={onClose}
                    onConfirm={onConfirm}
                    title="Request More Info"
                    description={`Request more information about ${address}?`}
                    confirmText="Send Request"
                    cancelText="Cancel"
                    isLoading={isLoading}
                />
            )}
        </AppDialog>
    );
}
