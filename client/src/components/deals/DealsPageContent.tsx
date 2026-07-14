import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import AppDialog from '@/components/modals/Dialog';
import { BestBuyersDialog } from './BestBuyersDialog';
import { Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useAccessGate } from '@/hooks/useAccessGate';
import { formatAddress } from '@shared/utils/formatAddress';
import type { Deal, DealToEdit } from '@shared/types/deals';
import type { DealColumn } from '@/types/deals';
import DealsHeader from '@/components/deals/DealsHeader';
import DealsGrid from '@/components/deals/DealsGrid';
import DealsEmptyState from '@/components/deals/DealsEmptyState';
import AddDealDialog from '@/components/deals/AddDealDialog';
import EditDealDialog from '@/components/deals/EditDealDialog';
import DeleteDealDialog from '@/components/deals/DeleteDealDialog';
import RequestDealInfoDialog from '@/components/deals/RequestDealInfoDialog';
import SendOfferDialog from '@/components/deals/SendOfferDialog';
import DealOffersDialog from '@/components/deals/DealOffersDialog';
import { useDealsNav } from '@/hooks/useNav';
import { useDealsColumn } from '@/hooks/useDealsColumn';
import type {
    RequestDealInfoFormValues,
    SubmitOfferFormValues,
} from '@database/validation/deals.validation';

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
    const { user, canAccessApp, isAdmin, isOwner, isRelationshipManager } = useAuth();
    const { requireAuth, requireSubscription } = useAccessGate();
    const { tab, locationFilter, dealId, setTab, setLocationFilter, setDealId } = useDealsNav();

    const canManageDeals = isAdmin || isOwner || isRelationshipManager;

    // Filter params shared by both columns; `status` + `page` are appended per request.
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

    // New and Sold paginate independently — one infinite query per column.
    const newDealsQuery = useDealsColumn('new', filterParams);
    const soldDealsQuery = useDealsColumn('sold', filterParams);

    const isLoading = newDealsQuery.isLoading || soldDealsQuery.isLoading;
    const loadedNewDeals = newDealsQuery.data?.pages.flatMap((p) => p.deals) ?? [];
    const loadedSoldDeals = soldDealsQuery.data?.pages.flatMap((p) => p.deals) ?? [];

    // Secondary fetch for a linked deal (?dealId) absent from the loaded pages of either column.
    const dealInList =
        dealId !== null &&
        (loadedNewDeals.some((d) => d.id === dealId) ||
            loadedSoldDeals.some((d) => d.id === dealId));
    const { data: pinnedDeal = null } = useQuery<Deal | null>({
        queryKey: ['/api/deals', 'single', dealId],
        enabled: dealId !== null && !isLoading && !dealInList,
        staleTime: 30_000,
        retry: false,
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/deals/${dealId}`);
            if (!res.ok) return null;
            return res.json() as Promise<Deal>;
        },
    });

    // Prepend the pinned deal to the top of its column when it isn't already loaded.
    const pinnedIsSold = pinnedDeal?.dealType === 'sold';
    const newDeals =
        pinnedDeal && !dealInList && !pinnedIsSold
            ? [pinnedDeal, ...loadedNewDeals]
            : loadedNewDeals;
    const soldDeals =
        pinnedDeal && !dealInList && pinnedIsSold
            ? [pinnedDeal, ...loadedSoldDeals]
            : loadedSoldDeals;
    const pinnedDealId = pinnedDeal && !dealInList ? dealId : null;

    // Column badge counts: server totals, bumped to include an out-of-filter pinned deal.
    const newCount = Math.max(newDealsQuery.data?.pages[0]?.total ?? 0, newDeals.length);
    const soldCount = Math.max(soldDealsQuery.data?.pages[0]?.total ?? 0, soldDeals.length);

    const newColumn: DealColumn = {
        deals: newDeals,
        count: newCount,
        hasMore: newDealsQuery.hasNextPage,
        isLoadingMore: newDealsQuery.isFetchingNextPage,
        onLoadMore: () => newDealsQuery.fetchNextPage(),
    };
    const soldColumn: DealColumn = {
        deals: soldDeals,
        count: soldCount,
        hasMore: soldDealsQuery.hasNextPage,
        isLoadingMore: soldDealsQuery.isFetchingNextPage,
        onLoadMore: () => soldDealsQuery.fetchNextPage(),
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

    const handleAddDeal = () =>
        requireAuth(() =>
            requireSubscription(() => setShowAddDeal(true), {
                tiers: ['basic', 'pro', 'premium'],
                subject: 'Request Access',
                message: 'I would like to request access to post deals on the ARV data application',
            }),
        );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <DealsHeader
                tab={tab}
                locationFilter={locationFilter}
                onTabChange={(t) => (t === 'mine' ? requireAuth(() => setTab(t)) : setTab(t))}
                onAddDeal={handleAddDeal}
                onLocationFilterChange={setLocationFilter}
            />

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading deals...</p>
                    </div>
                </div>
            ) : newDeals.length + soldDeals.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <DealsEmptyState
                        title={tab === 'mine' ? 'No deals posted yet' : 'No deals found'}
                        message={
                            locationFilter
                                ? `No deals match the selected location. Try a different filter.`
                                : tab === 'mine'
                                  ? 'Your posted deals will appear here.'
                                  : 'Be the first to post a deal to the feed.'
                        }
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden min-h-0">
                    <DealsGrid
                        newColumn={newColumn}
                        soldColumn={soldColumn}
                        canManageDeals={!!canManageDeals}
                        canAccessApp={!!canAccessApp}
                        isAdmin={!!isAdmin}
                        isOwner={!!isOwner}
                        isRelationshipManager={!!isRelationshipManager}
                        userId={user?.id}
                        expandedDealId={dealId}
                        pinnedDealId={pinnedDealId}
                        onToggleDeal={setDealId}
                        onDelete={(deal) =>
                            setDeleteConfirm({
                                dealId: deal.id,
                                address: deal.address ?? 'this deal',
                            })
                        }
                        onEdit={(deal) =>
                            setEditDeal({ ...deal, links: deal.links.map((l) => l.url) })
                        }
                        requestingInfoDealId={
                            requestDealInfo.isPending
                                ? requestDealInfo.variables?.dealId
                                : undefined
                        }
                        onRequestInfo={(deal) =>
                            requireAuth(() =>
                                requireSubscription(() => setConfirmRequestDeal(deal), {
                                    tiers: ['basic', 'pro', 'premium'],
                                    subject: 'Request Access',
                                }),
                            )
                        }
                        onSubmitOffer={(deal) => requireAuth(() => setOfferDeal(deal))}
                        onViewOffers={(deal) => setViewOffersDeal(deal)}
                        onTopBuyers={(deal) => setBestBuyersDeal(deal)}
                    />
                </div>
            )}

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
                address={
                    formatAddress(confirmRequestDeal?.address) ??
                    [formatAddress(confirmRequestDeal?.city), confirmRequestDeal?.state]
                        .filter(Boolean)
                        .join(', ') ??
                    'this property'
                }
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
                address={
                    formatAddress(offerDeal?.address) ||
                    [formatAddress(offerDeal?.city), offerDeal?.state].filter(Boolean).join(', ') ||
                    'this property'
                }
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
                        address={
                            formatAddress(viewOffersDeal.address) ||
                            [formatAddress(viewOffersDeal.city), viewOffersDeal.state]
                                .filter(Boolean)
                                .join(', ') ||
                            'this property'
                        }
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
