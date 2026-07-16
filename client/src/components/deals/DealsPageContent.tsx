import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import AppDialog from '@/components/modals/Dialog';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { formatAddress } from '@shared/utils/formatAddress';
import { dealCaps } from '@/utils/deals';
import type { Deal, DealToEdit } from '@shared/types/deals';
import DealsToolbar from '@/components/deals/DealsToolbar';
import DealsBrowser from '@/components/deals/DealsBrowser';
import AddDealDialog from '@/components/deals/AddDealDialog';
import EditDealDialog from '@/components/deals/EditDealDialog';
import DeleteDealDialog from '@/components/deals/DeleteDealDialog';
import RequestDealInfoDialog from '@/components/deals/RequestDealInfoDialog';
import SendOfferDialog from '@/components/deals/SendOfferDialog';
import DealOffersDialog from '@/components/deals/DealOffersDialog';
import { BestBuyersDialog } from '@/components/deals/BestBuyersDialog';
import { useDealsNav } from '@/hooks/useNav';
import { useDealsFeed } from '@/hooks/useDealsFeed';
import { usePinnedDeal } from '@/hooks/usePinnedDeal';
import type {
    RequestDealInfoFormValues,
    SubmitOfferFormValues,
} from '@database/validation/deals.validation';

/**
 * The live /deals page content: filter toolbar over the master–detail browser on the unified
 * newest-first feed, plus every deal dialog. Mounted under AppAccessGate, which already enforces
 * auth + subscription/role — no in-page gating.
 */
export default function DealsPageContent() {
    const [showAddDeal, setShowAddDeal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ dealId: number; address: string } | null>(
        null,
    );
    const [confirmRequestDeal, setConfirmRequestDeal] = useState<Deal | null>(null);
    const [requestInfoSucceeded, setRequestInfoSucceeded] = useState(false);
    const [offerDeal, setOfferDeal] = useState<Deal | null>(null);
    const [offerSucceeded, setOfferSucceeded] = useState(false);
    const [viewOffersDeal, setViewOffersDeal] = useState<Deal | null>(null);
    const [editDeal, setEditDeal] = useState<DealToEdit | null>(null);
    const [bestBuyersDeal, setBestBuyersDeal] = useState<Deal | null>(null);

    const { toast } = useToast();
    const { user, isAdmin, isOwner, isRelationshipManager } = useAuth();
    const {
        tab,
        typeFilter,
        locationFilter,
        dealId,
        setTab,
        setTypeFilter,
        setLocationFilter,
        setDealId,
    } = useDealsNav();

    // Scope/location params shared with the feed; type/page/limit are appended per request.
    const filterParams = (() => {
        const params = new URLSearchParams();
        if (tab === 'mine' && user?.id) params.set('userId', user.id);
        if (locationFilter?.type === 'county') {
            params.set('county', locationFilter.value);
            params.set('state', locationFilter.state);
        } else if (locationFilter?.type === 'msa') {
            params.set('msaName', locationFilter.value);
        } else if (locationFilter?.type === 'city') {
            params.set('city', locationFilter.value);
            params.set('state', locationFilter.state);
        } else if (locationFilter?.type === 'zip') {
            params.set('zipCode', locationFilter.value);
        }
        return params.toString();
    })();

    const feed = useDealsFeed(typeFilter, filterParams);
    const loadedDeals = feed.data?.pages.flatMap((p) => p.deals) ?? [];

    // A deep-linked deal outside the loaded pages/filters is pinned to the top of the feed, so a
    // shared link always shows the deal it promised.
    const { pinnedDeal, isGone } = usePinnedDeal(dealId, loadedDeals);
    const deals = pinnedDeal ? [pinnedDeal, ...loadedDeals] : loadedDeals;

    // A link to a deal that no longer exists heals itself: strip the dead dealId with a replacing
    // navigation (no history entry) and leave a truthful clean feed — no error state.
    useEffect(() => {
        if (isGone) setDealId(null, { replace: true });
    }, [isGone, setDealId]);

    // isOwner from useAuth is the ARV "owner" role — distinct from DealCaps.isOwner ("viewer
    // posted this deal"), hence the isArvOwner name on the viewer.
    const viewer = {
        userId: user?.id ?? '',
        isAdmin: !!isAdmin,
        isArvOwner: !!isOwner,
        isRelationshipManager: !!isRelationshipManager,
    };

    const deleteDeal = useMutation({
        mutationFn: async (dealId: number) => {
            const res = await apiRequest('DELETE', `/api/deals/${dealId}`);
            return res.json();
        },
        onSuccess: () => {
            toast({
                title: 'Deal Deleted',
                description: 'The deal has been removed from the feed.',
            });
            queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
            setDeleteConfirm(null);
        },
        onError: (err: any) => {
            toast({
                title: 'Error',
                description: err.message || 'Failed to delete deal',
                variant: 'destructive',
            });
            setDeleteConfirm(null);
        },
    });

    const requestDealInfo = useMutation({
        mutationFn: async ({ dealId, ...body }: { dealId: number } & RequestDealInfoFormValues) => {
            const res = await apiRequest('POST', `/api/deals/${dealId}/request-info`, body);
            return res.json();
        },
        onSuccess: () => {
            setRequestInfoSucceeded(true);
        },
        onError: () => {
            toast({
                title: 'Error',
                description: 'Failed to send request. Please try again.',
                variant: 'destructive',
            });
        },
    });

    const submitOffer = useMutation({
        mutationFn: async ({ dealId, ...body }: { dealId: number } & SubmitOfferFormValues) => {
            const res = await apiRequest('POST', `/api/deals/${dealId}/offers`, body);
            return res.json();
        },
        onSuccess: () => {
            setOfferSucceeded(true);
        },
        onError: (err: any) => {
            toast({
                title: 'Error',
                description: err?.message || 'Failed to send offer. Please try again.',
                variant: 'destructive',
            });
        },
    });

    const addressOf = (deal: Deal | null) =>
        formatAddress(deal?.address) ||
        [formatAddress(deal?.city), deal?.state].filter(Boolean).join(', ') ||
        'this property';

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <DealsToolbar
                typeFilter={typeFilter}
                locationFilter={locationFilter}
                onTypeFilterChange={setTypeFilter}
                onLocationFilterChange={setLocationFilter}
                onAddDeal={() => setShowAddDeal(true)}
            />

            <div className="min-h-0 flex-1">
                <DealsBrowser
                    deals={deals}
                    isLoading={feed.isLoading}
                    hasMore={!!feed.hasNextPage}
                    isLoadingMore={feed.isFetchingNextPage}
                    onLoadMore={() => feed.fetchNextPage()}
                    scope={tab}
                    onScopeChange={setTab}
                    selectedDealId={dealId}
                    onSelectDeal={setDealId}
                    capabilitiesFor={(deal) => dealCaps(deal, viewer)}
                    requestingInfoDealId={
                        requestDealInfo.isPending ? requestDealInfo.variables?.dealId : undefined
                    }
                    onEdit={(deal) => setEditDeal({ ...deal, links: deal.links.map((l) => l.url) })}
                    onDelete={(deal) =>
                        setDeleteConfirm({ dealId: deal.id, address: addressOf(deal) })
                    }
                    onRequestInfo={(deal) => {
                        setRequestInfoSucceeded(false);
                        setConfirmRequestDeal(deal);
                    }}
                    onSubmitOffer={(deal) => {
                        setOfferSucceeded(false);
                        setOfferDeal(deal);
                    }}
                    onViewOffers={setViewOffersDeal}
                    onTopBuyers={setBestBuyersDeal}
                    emptyTitle={
                        tab === 'mine' ? 'You haven’t posted any deals' : 'No deals match'
                    }
                    emptyMessage={
                        locationFilter || typeFilter !== 'all'
                            ? 'Try widening your filters to see more of the marketplace.'
                            : 'New deals from the community will show up here.'
                    }
                    emptyAction={
                        <Button onClick={() => setShowAddDeal(true)}>Post a deal</Button>
                    }
                />
            </div>

            {/* Dialogs */}
            <AddDealDialog open={showAddDeal} onClose={() => setShowAddDeal(false)} />

            {editDeal && (
                <EditDealDialog
                    deal={editDeal}
                    open={!!editDeal}
                    onClose={() => setEditDeal(null)}
                />
            )}

            <DeleteDealDialog
                open={!!deleteConfirm}
                address={deleteConfirm?.address ?? ''}
                isLoading={deleteDeal.isPending}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => deleteConfirm && deleteDeal.mutate(deleteConfirm.dealId)}
            />

            <RequestDealInfoDialog
                open={!!confirmRequestDeal}
                address={addressOf(confirmRequestDeal)}
                isLoading={requestDealInfo.isPending}
                succeeded={requestInfoSucceeded}
                user={user}
                onClose={() => {
                    setConfirmRequestDeal(null);
                    setRequestInfoSucceeded(false);
                }}
                onConfirm={(formData) =>
                    confirmRequestDeal &&
                    requestDealInfo.mutate({ dealId: confirmRequestDeal.id, ...formData })
                }
            />

            <SendOfferDialog
                open={!!offerDeal}
                address={addressOf(offerDeal)}
                isLoading={submitOffer.isPending}
                succeeded={offerSucceeded}
                user={user}
                onClose={() => {
                    setOfferDeal(null);
                    setOfferSucceeded(false);
                }}
                onConfirm={(formData) =>
                    offerDeal && submitOffer.mutate({ dealId: offerDeal.id, ...formData })
                }
            />

            <AppDialog
                open={!!viewOffersDeal}
                onClose={() => setViewOffersDeal(null)}
                className="max-w-md"
            >
                {viewOffersDeal && (
                    <DealOffersDialog
                        dealId={viewOffersDeal.id}
                        address={addressOf(viewOffersDeal)}
                    />
                )}
            </AppDialog>

            <AppDialog
                open={!!bestBuyersDeal}
                onClose={() => setBestBuyersDeal(null)}
                className="max-w-md"
            >
                {bestBuyersDeal && (
                    <BestBuyersDialog
                        dealId={bestBuyersDeal.id}
                        address={bestBuyersDeal.address}
                        city={bestBuyersDeal.city}
                        state={bestBuyersDeal.state}
                        zipCode={bestBuyersDeal.zipCode}
                        onClose={() => setBestBuyersDeal(null)}
                    />
                )}
            </AppDialog>
        </div>
    );
}
