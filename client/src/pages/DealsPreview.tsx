import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { FlaskConical } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import AppDialog from '@/components/modals/Dialog';
import { PageLoader } from '@/components/PageLoader';
import DealsToolbar, { type DealTypeFilter } from '@/components/deals/DealsToolbar';
import DealsBrowser from '@/components/deals/DealsBrowser';
import AddDealDialog from '@/components/deals/AddDealDialog';
import EditDealDialog from '@/components/deals/EditDealDialog';
import DeleteDealDialog from '@/components/deals/DeleteDealDialog';
import RequestDealInfoDialog from '@/components/deals/RequestDealInfoDialog';
import SendOfferDialog from '@/components/deals/SendOfferDialog';
import DealOffersDialog from '@/components/deals/DealOffersDialog';
import { BestBuyersDialog } from '@/components/deals/BestBuyersDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { isSold } from '@/utils/deals';
import { formatAddress } from '@shared/utils/formatAddress';
import { MOCK_USER_ID, filterMockDeals } from '@/pages/DealsPreview.mock';
import type { Deal, DealTab, DealToEdit } from '@shared/types/deals';
import type { DealCaps, LocationFilter } from '@/types/deals';

type ViewerRole = 'member' | 'admin';

/**
 * Gates the mock Deals preview to ARV admins/owners only; everyone else is sent to /login. The
 * redirect-back param is attached only for signed-out visitors — a signed-in non-privileged user
 * carrying it would loop, since Login forwards authenticated users straight to the target.
 * Access-check hooks live here so the heavy preview only mounts once access is granted.
 */
export default function DealsPreview() {
    const { isLoading, isAdminStatusLoading, isAuthenticated, isAdmin, isOwner } = useAuth();
    const [, setLocation] = useLocation();
    const search = useSearch();

    const verifying = isLoading || isAdminStatusLoading;
    const allowed = isAdmin || isOwner;

    useEffect(() => {
        if (verifying || allowed) return;
        if (isAuthenticated) {
            setLocation('/login', { replace: true });
        } else {
            const here = `/deals-preview${search ? `?${search}` : ''}`;
            setLocation(`/login?redirect=${encodeURIComponent(here)}`, { replace: true });
        }
    }, [verifying, allowed, isAuthenticated, search, setLocation]);

    if (verifying) {
        return <PageLoader className="h-dvh bg-background" />;
    }
    if (!allowed) return null; // redirecting to /login

    return <DealsPreviewContent />;
}

/**
 * The mock Deals harness itself — no backend. Mounts the real toolbar, browser, and dialogs so what
 * you review here is what ships. Preview state can be seeded from the URL for reproducible shots.
 */
function DealsPreviewContent() {
    const { toast } = useToast();

    // Initial state can be seeded from the URL (?role=admin&type=sold&deal=1) so a specific
    // preview state is shareable and reproducible — handy for screenshots and design review.
    const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const [role, setRole] = useState<ViewerRole>(q.get('role') === 'admin' ? 'admin' : 'member');
    const [scope, setScope] = useState<DealTab>(q.get('scope') === 'mine' ? 'mine' : 'all');
    const [typeFilter, setTypeFilter] = useState<DealTypeFilter>(
        (['wholesale', 'agent', 'reo', 'sold'] as const).includes(q.get('type') as never)
            ? (q.get('type') as DealTypeFilter)
            : 'all',
    );
    const [location, setLocation] = useState<LocationFilter | null>(null);
    const [selectedDealId, setSelectedDealId] = useState<number | null>(
        q.get('deal') ? Number(q.get('deal')) || null : null,
    );

    // Dialog state — mirrors the live page's orchestration.
    const [showAddDeal, setShowAddDeal] = useState(false);
    const [editDeal, setEditDeal] = useState<DealToEdit | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; address: string } | null>(null);
    const [requestDeal, setRequestDeal] = useState<Deal | null>(null);
    const [requestPending, setRequestPending] = useState(false);
    const [requestSucceeded, setRequestSucceeded] = useState(false);
    const [offerDeal, setOfferDeal] = useState<Deal | null>(null);
    const [offerPending, setOfferPending] = useState(false);
    const [offerSucceeded, setOfferSucceeded] = useState(false);
    const [viewOffersDeal, setViewOffersDeal] = useState<Deal | null>(null);
    const [bestBuyersDeal, setBestBuyersDeal] = useState<Deal | null>(null);

    const deals = useMemo(
        () => filterMockDeals({ scope, typeFilter, location }),
        [scope, typeFilter, location],
    );

    const capabilitiesFor = (deal: Deal): DealCaps => {
        const isMine = deal.userId === MOCK_USER_ID;
        const isAdmin = role === 'admin';
        return {
            canEdit: isMine || isAdmin,
            canDelete: isMine || isAdmin,
            canRequestContact: !isSold(deal) && !isMine,
            canSubmitOffer: !isSold(deal) && !isMine,
            isOwner: isMine,
            canViewPoster: isAdmin,
        };
    };

    const addressOf = (deal: Deal | null) =>
        formatAddress(deal?.address) ||
        [formatAddress(deal?.city), deal?.state].filter(Boolean).join(', ') ||
        'this property';

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background">
            {/* Dev harness banner — not part of the shipping page */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/40 px-4 py-2 text-sm md:px-6">
                <span className="flex items-center gap-2 font-medium text-foreground">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    Deals — live preview
                </span>
                <span className="text-xs text-muted-foreground">
                    Mock data · no backend · what you see is the real component set
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">View as</span>
                    <Tabs value={role} onValueChange={(v) => setRole(v as ViewerRole)}>
                        <TabsList className="h-8">
                            <TabsTrigger value="member" className="text-xs">
                                Member
                            </TabsTrigger>
                            <TabsTrigger value="admin" className="text-xs">
                                ARV Admin
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <DealsToolbar
                typeFilter={typeFilter}
                locationFilter={location}
                onTypeFilterChange={setTypeFilter}
                onLocationFilterChange={setLocation}
                onAddDeal={() => setShowAddDeal(true)}
            />

            <div className="min-h-0 flex-1">
                <DealsBrowser
                    deals={deals}
                    isLoading={false}
                    hasMore={false}
                    isLoadingMore={false}
                    onLoadMore={() => {}}
                    scope={scope}
                    onScopeChange={setScope}
                    selectedDealId={selectedDealId}
                    onSelectDeal={setSelectedDealId}
                    capabilitiesFor={capabilitiesFor}
                    requestingInfoDealId={requestPending ? (requestDeal?.id ?? undefined) : undefined}
                    onEdit={(deal) => setEditDeal({ ...deal, links: deal.links.map((l) => l.url) })}
                    onDelete={(deal) =>
                        setDeleteConfirm({ id: deal.id, address: addressOf(deal) })
                    }
                    onRequestInfo={(deal) => {
                        setRequestSucceeded(false);
                        setRequestDeal(deal);
                    }}
                    onSubmitOffer={(deal) => {
                        setOfferSucceeded(false);
                        setOfferDeal(deal);
                    }}
                    onViewOffers={setViewOffersDeal}
                    onTopBuyers={setBestBuyersDeal}
                    emptyTitle={
                        scope === 'mine' ? 'You haven’t posted any deals' : 'No deals match'
                    }
                    emptyMessage={
                        location || typeFilter !== 'all'
                            ? 'Try widening your filters to see more of the marketplace.'
                            : 'New deals from the community will show up here.'
                    }
                    emptyAction={
                        <Button onClick={() => setShowAddDeal(true)}>Post a deal</Button>
                    }
                />
            </div>

            {/* ── Dialogs (real components; submissions are no-ops in preview) ── */}
            <AddDealDialog open={showAddDeal} onClose={() => setShowAddDeal(false)} />

            {editDeal && (
                <EditDealDialog deal={editDeal} open onClose={() => setEditDeal(null)} />
            )}

            <DeleteDealDialog
                open={!!deleteConfirm}
                address={deleteConfirm?.address ?? ''}
                isLoading={false}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => {
                    toast({ title: 'Deal deleted', description: '(preview — no data changed)' });
                    setDeleteConfirm(null);
                }}
            />

            <RequestDealInfoDialog
                open={!!requestDeal}
                address={addressOf(requestDeal)}
                isLoading={requestPending}
                succeeded={requestSucceeded}
                user={null}
                onClose={() => {
                    setRequestDeal(null);
                    setRequestSucceeded(false);
                }}
                onConfirm={() => {
                    setRequestPending(true);
                    window.setTimeout(() => {
                        setRequestPending(false);
                        setRequestSucceeded(true);
                    }, 700);
                }}
            />

            <SendOfferDialog
                open={!!offerDeal}
                address={addressOf(offerDeal)}
                isLoading={offerPending}
                succeeded={offerSucceeded}
                user={null}
                onClose={() => {
                    setOfferDeal(null);
                    setOfferSucceeded(false);
                }}
                onConfirm={() => {
                    setOfferPending(true);
                    window.setTimeout(() => {
                        setOfferPending(false);
                        setOfferSucceeded(true);
                    }, 700);
                }}
            />

            <AppDialog
                open={!!viewOffersDeal}
                onClose={() => setViewOffersDeal(null)}
                className="max-w-md"
            >
                {viewOffersDeal && (
                    <DealOffersDialog dealId={viewOffersDeal.id} address={addressOf(viewOffersDeal)} />
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
