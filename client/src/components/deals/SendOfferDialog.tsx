import AppDialog from '@/components/modals/Dialog';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SendOfferForm from '@/components/deals/SendOfferForm';

import type { AuthUser } from '@/hooks/use-auth';
import type { SubmitOfferFormValues } from '@database/validation/deals.validation';

type SendOfferDialogProps = {
    open: boolean;
    address: string;
    isLoading: boolean;
    succeeded: boolean;
    user: AuthUser | null;
    onClose: () => void;
    onConfirm: (data: SubmitOfferFormValues) => void;
};

export default function SendOfferDialog({
    open,
    address,
    isLoading,
    succeeded,
    user,
    onClose,
    onConfirm,
}: SendOfferDialogProps) {
    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-lg">
            {succeeded ? (
                <>
                    <DialogHeader>
                        <DialogTitle>Offer Sent</DialogTitle>
                        <DialogDescription>
                            Your offer on {address} has been sent to the person who posted this
                            deal. They'll reach out if they're interested.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="pt-4">
                        <Button variant="outline" onClick={onClose} className="w-full" size="base">
                            Close
                        </Button>
                    </div>
                </>
            ) : (
                <SendOfferForm
                    address={address}
                    user={user}
                    isLoading={isLoading}
                    onClose={onClose}
                    onSubmit={onConfirm}
                />
            )}
        </AppDialog>
    );
}
