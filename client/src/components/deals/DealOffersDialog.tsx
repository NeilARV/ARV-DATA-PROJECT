import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Mail, Phone, HandCoins, Trash2 } from 'lucide-react';

import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';

import { useToast } from '@/hooks/use-toast';

import { apiRequest, queryClient } from '@/lib/queryClient';

type DealOffersDialogProps = {
    dealId: number;
    address: string;
};

function formatOfferDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function DealOffersDialog({ dealId, address }: DealOffersDialogProps) {
    const { toast } = useToast();
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const { data, isLoading, isError } = useQuery<{ offers: DealOffer[] }>({
        queryKey: ['/api/deals', dealId, 'offers'],
        staleTime: 0,
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/deals/${dealId}/offers`);
            return res.json();
        },
    });

    const deleteOffer = useMutation({
        mutationFn: async (offerId: number) => {
            const res = await apiRequest('DELETE', `/api/deals/${dealId}/offers/${offerId}`);
            return res.json();
        },
        onSuccess: () => {
            toast({ title: 'Offer Removed', description: 'The offer has been deleted.' });
            queryClient.invalidateQueries({ queryKey: ['/api/deals', dealId, 'offers'] });
            queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
            setConfirmDeleteId(null);
        },
        onError: (err: any) => {
            toast({
                title: 'Error',
                description: err?.message || 'Failed to remove offer. Please try again.',
                variant: 'destructive',
            });
            setConfirmDeleteId(null);
        },
    });

    const offers = data?.offers ?? [];

    return (
        <>
            <DialogHeader>
                <DialogTitle>Offers Received</DialogTitle>
                <DialogDescription>
                    Non-binding offers submitted on {address}. Only you can see these.
                </DialogDescription>
            </DialogHeader>

            <div className="pt-2 max-h-[60dvh] overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : isError ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        Could not load offers. Please try again.
                    </p>
                ) : offers.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <HandCoins className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No offers yet.</p>
                    </div>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {offers.map((offer) => (
                            <li
                                key={offer.id}
                                className="rounded-lg border border-border p-3 flex flex-col gap-1.5"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-lg font-semibold text-foreground">
                                        ${Number(offer.amount).toLocaleString()}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {formatOfferDate(offer.createdAt)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDeleteId(offer.id)}
                                            aria-label="Remove offer"
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-foreground">
                                    {[offer.firstName, offer.lastName].filter(Boolean).join(' ') ||
                                        'Anonymous'}
                                </span>
                                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1.5">
                                        <Mail className="w-3.5 h-3.5 shrink-0" />
                                        {offer.email}
                                    </span>
                                    {offer.phone && (
                                        <span className="flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 shrink-0" />
                                            {offer.phone}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <AppDialog
                nested
                open={confirmDeleteId !== null}
                onClose={() => !deleteOffer.isPending && setConfirmDeleteId(null)}
                className="sm:max-w-sm"
            >
                <ConfirmationContent
                    onClose={() => setConfirmDeleteId(null)}
                    onConfirm={() =>
                        confirmDeleteId !== null && deleteOffer.mutate(confirmDeleteId)
                    }
                    title="Remove Offer"
                    description="Remove this offer? This cannot be undone."
                    confirmText="Remove"
                    cancelText="Cancel"
                    variant="destructive"
                    isLoading={deleteOffer.isPending}
                />
            </AppDialog>
        </>
    );
}
