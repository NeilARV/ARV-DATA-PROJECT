import AppDialog from '@/components/modals/Dialog';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import RequestDealInfoForm from '@/components/deals/RequestDealInfoForm';
import type { RequestDealInfoFormValues } from '@database/validation/deals.validation';
import type { AuthUser } from '@/hooks/use-auth';

type RequestDealInfoDialogProps = {
    open: boolean;
    address: string;
    isLoading: boolean;
    succeeded: boolean;
    user: AuthUser | null;
    onClose: () => void;
    onConfirm: (data: RequestDealInfoFormValues) => void;
};

export default function RequestDealInfoDialog({
    open,
    address,
    isLoading,
    succeeded,
    user,
    onClose,
    onConfirm,
}: RequestDealInfoDialogProps) {
    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-lg">
            {succeeded ? (
                <>
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <DialogTitle>Request Received</DialogTitle>
                        </div>
                        <DialogDescription>
                            A member of our team will reach out to you shortly with more details
                            regarding {address}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="pt-4">
                        <Button variant="outline" onClick={onClose} className="w-full" size="base">
                            Close
                        </Button>
                    </div>
                </>
            ) : (
                <RequestDealInfoForm
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
