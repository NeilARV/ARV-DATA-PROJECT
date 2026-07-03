import { Property } from '@/types/property';
import { PROPERTY_STATUS } from '@/constants/propertyStatus.constants';
import {
    Bed,
    Bath,
    Maximize2,
    Building2,
    Calendar,
    Phone,
    User,
    Mail,
    Star,
    Pencil,
    Landmark,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getStreetViewUrl } from '@/lib/streetView';
import { Badge } from '@/components/ui/badge';
import { formatAddress } from '@shared/utils/formatAddress';
import { isNegative } from '@/utils/isNegative';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { formatDate, calculateDaysOwned } from '@/utils/date';
import { Button } from '@/components/ui/button';
type Section = 'panel' | 'modal' | 'card';

// One size for every variant so a property's image is fetched once and reused across
// card, panel, and modal — same URL means one network request and one cache entry,
// instead of a separate Street View call each time the same property opens in a modal.
const IMAGE_SIZE = '400x300';

const VARIANT_CFG = {
    card: {
        imageClass: 'aspect-[4/3] overflow-hidden bg-muted relative',
        arvBadgeTextClass: 'text-sm',
        arvIconClass: 'w-3.5 h-3.5',
        priceClass: 'text-xl font-bold text-foreground',
        dateLabelClass: 'text-sm',
        addressClass: 'text-base font-medium text-foreground',
        cityClass: 'text-sm text-muted-foreground mb-2',
        bedsContainerClass: 'flex items-center gap-4 text-sm text-foreground',
        propertyTypeClass: 'text-sm text-muted-foreground mt-2',
        gridGapClass: 'gap-4',
        buyerSellerFontClass: 'font-semibold text-sm text-foreground',
        buildingIconClass: 'w-4 h-4',
        contactSpacingClass: 'mt-1.5 space-y-1',
        contactTextClass: 'text-sm text-muted-foreground',
        showMeta: false,
        clickableCompanies: false,
        spreadPositivePrefix: '+',
    },
    modal: {
        imageClass: 'aspect-[4/3] overflow-hidden rounded-lg bg-muted relative',
        arvBadgeTextClass: 'text-sm',
        arvIconClass: 'w-3.5 h-3.5',
        priceClass: 'text-2xl font-bold',
        dateLabelClass: 'text-sm',
        addressClass: 'text-lg font-medium',
        cityClass: 'text-muted-foreground',
        bedsContainerClass: 'flex items-center gap-4 text-sm',
        propertyTypeClass: 'text-sm text-muted-foreground mt-2',
        gridGapClass: 'gap-4',
        buyerSellerFontClass: 'font-semibold text-sm text-foreground',
        buildingIconClass: 'w-4 h-4',
        contactSpacingClass: 'mt-1.5 space-y-1',
        contactTextClass: 'text-sm text-muted-foreground',
        showMeta: true,
        clickableCompanies: true,
        spreadPositivePrefix: '',
    },
    panel: {
        imageClass: 'aspect-[4/3] overflow-hidden rounded-lg bg-muted relative',
        arvBadgeTextClass: 'text-xs',
        arvIconClass: 'w-3 h-3',
        priceClass: 'text-2xl font-bold',
        dateLabelClass: 'text-xs',
        addressClass: 'text-base font-medium',
        cityClass: 'text-sm text-muted-foreground',
        bedsContainerClass: 'flex items-center gap-3 text-sm',
        propertyTypeClass: 'text-xs text-muted-foreground mt-2',
        gridGapClass: 'gap-3',
        buyerSellerFontClass: 'font-semibold text-xs text-foreground',
        buildingIconClass: 'w-3.5 h-3.5',
        contactSpacingClass: 'mt-1 space-y-0.5',
        contactTextClass: 'text-xs text-muted-foreground',
        showMeta: true,
        clickableCompanies: true,
        spreadPositivePrefix: '',
    },
} as const;

interface PropertyContentProps {
    property: Property;
    variant: Section;
    onDeleteClick?: () => void;
    deleteIsPending?: boolean;
    onEditClick?: () => void;
    isAdminOrOwner?: boolean;
    onCompanyClick?: (name: string, id: string | null, isBuyer: boolean) => void;
}

export function PropertyContent({
    property,
    variant,
    onDeleteClick,
    deleteIsPending,
    onEditClick,
    isAdminOrOwner,
    onCompanyClick,
}: PropertyContentProps) {
    const { canAccessAdminPanel, isAdmin, isOwner } = useAuth();
    const [imageUrl, setImageUrl] = useState('');
    const [isImageLoading, setIsImageLoading] = useState(true);

    // Resolve the image URL only. Loading/error is driven by the rendered <img>'s own
    // onLoad/onError below — no separate `new Image()` preload, which used to fire a
    // second identical request to the Street View endpoint on a cold cache.
    useEffect(() => {
        setIsImageLoading(true);
        if (property.imageUrl) {
            setImageUrl(property.imageUrl);
            return;
        }
        let cancelled = false;
        getStreetViewUrl(
            property.address,
            property.city,
            property.state,
            IMAGE_SIZE,
            property.sfrPropertyId,
        )
            .then((url) => {
                if (cancelled) return;
                setImageUrl(url ?? '');
                if (!url) setIsImageLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setImageUrl('');
                setIsImageLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [
        property.address,
        property.city,
        property.state,
        property.imageUrl,
        property.sfrPropertyId,
    ]);

    const cfg = VARIANT_CFG[variant];
    const isCard = variant === 'card';
    const isDetail = !isCard;

    const statusNorm = (property.status || '').toLowerCase().trim();
    const statusList = (property.statuses ?? [property.status ?? '']).map((s) =>
        s.toLowerCase().trim(),
    );

    const STATUS_VARIANT_MAP: Record<string, 'cyan' | 'red' | 'green' | 'purple'> = {
        [PROPERTY_STATUS.IN_RENOVATION]: 'cyan',
        [PROPERTY_STATUS.SOLD]: 'red',
        [PROPERTY_STATUS.ON_MARKET]: 'green',
        [PROPERTY_STATUS.WHOLESALE]: 'purple',
    };
    const STATUS_LABEL_MAP: Record<string, string> = {
        [PROPERTY_STATUS.IN_RENOVATION]: 'Renovating',
        [PROPERTY_STATUS.SOLD]: 'Sold',
        [PROPERTY_STATUS.ON_MARKET]: 'On Market',
        [PROPERTY_STATUS.WHOLESALE]: 'Wholesale',
    };
    const isWholesale = statusList.includes(PROPERTY_STATUS.WHOLESALE);
    const isSold = statusList.includes(PROPERTY_STATUS.SOLD);
    const hasBothPurchasePrices =
        property.buyerPurchasePrice != null &&
        property.buyerPurchasePrice > 0 &&
        property.sellerPurchasePrice != null &&
        property.sellerPurchasePrice > 0;
    const showSpread = (isWholesale || isSold) && property.spread != null && hasBothPurchasePrices;
    const spreadLabel = isWholesale ? 'Wholesale Fee' : 'Gross Profit';

    // Admin/owner-only (the API already omits it for everyone else). Signed:
    // negative = bill owed (red), positive = refund (green).
    const supplementalTaxBill = isAdmin || isOwner ? (property.supplementalTaxBill ?? null) : null;

    const priceLabel = isSold ? 'Sold Price' : 'Purchase Price';
    const dateLabel =
        isWholesale || statusNorm === PROPERTY_STATUS.IN_RENOVATION
            ? 'Date Purchased'
            : 'Date Sold';

    const pricePerSqft =
        property.squareFeet > 0 ? Math.round(property.price / property.squareFeet) : 0;
    const daysOwned = calculateDaysOwned(property.dateSold);
    const formattedDateSold = formatDate(property.dateSold);
    const formattedBuyerPurchaseDate = formatDate(property.buyerPurchaseDate);
    const formattedSellerPurchaseDate = formatDate(property.sellerPurchaseDate);

    // Test IDs
    const tid = {
        img: isCard
            ? `img-property-${property.id}`
            : variant === 'modal'
              ? 'img-property-detail'
              : 'img-property-panel',
        price: isCard
            ? `text-price-${property.id}`
            : variant === 'modal'
              ? 'text-detail-price'
              : 'text-panel-price',
        dateSold: isCard
            ? `text-date-sold-${property.id}`
            : variant === 'modal'
              ? 'text-date-sold-detail'
              : 'text-date-sold-panel',
        address: isCard ? `text-address-${property.id}` : undefined,
        beds: isCard
            ? `text-beds-${property.id}`
            : variant === 'modal'
              ? 'text-detail-beds'
              : 'text-panel-beds',
        baths: isCard
            ? `text-baths-${property.id}`
            : variant === 'modal'
              ? 'text-detail-baths'
              : 'text-panel-baths',
        sqft: isCard
            ? `text-sqft-${property.id}`
            : variant === 'modal'
              ? 'text-detail-sqft'
              : 'text-panel-sqft',
        meta:
            variant === 'modal'
                ? 'text-detail-meta'
                : variant === 'panel'
                  ? 'text-panel-meta'
                  : undefined,
        buyerContainer: isCard ? `text-buyer-${property.id}` : undefined,
        buyerCompanyName: isDetail ? 'text-buyer-company-name' : undefined,
        buyerContact: isCard ? `text-buyer-contact-${property.id}` : 'text-buyer-contact',
        buyerEmail: isCard ? `text-buyer-email-${property.id}` : undefined,
        buyerPhone: isCard ? `text-buyer-phone-${property.id}` : undefined,
        sellerContainer: isCard ? `text-seller-${property.id}` : undefined,
        sellerCompanyName: isDetail ? 'text-seller-company-name' : undefined,
        sellerContact: isCard ? `text-seller-contact-${property.id}` : 'text-seller-contact',
        sellerEmail: isCard ? `text-seller-email-${property.id}` : undefined,
        sellerPhone: isCard ? `text-seller-phone-${property.id}` : undefined,
        spread: isCard
            ? `text-spread-${property.id}`
            : variant === 'modal'
              ? `text-spread-${property.id}-modal`
              : `text-spread-${property.id}-panel`,
        supplementalTax: isCard
            ? `text-supplemental-tax-${property.id}`
            : variant === 'modal'
              ? `text-supplemental-tax-${property.id}-modal`
              : `text-supplemental-tax-${property.id}-panel`,
        assignorCompanyName: isCard ? `text-assignor-${property.id}` : 'text-assignor-company-name',
        assignorContact: isCard ? `text-assignor-contact-${property.id}` : 'text-assignor-contact',
        assignorEmail: isCard ? `text-assignor-email-${property.id}` : undefined,
        assignorPhone: isCard ? `text-assignor-phone-${property.id}` : undefined,
    };

    // ── Image section ──────────────────────────────────────────────────────────
    const imageSection = (
        <div className={cfg.imageClass}>
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt={property.address}
                    className={`w-full h-full object-cover ${isImageLoading ? 'opacity-0' : ''}`}
                    onLoad={() => setIsImageLoading(false)}
                    onError={() => {
                        setImageUrl('');
                        setIsImageLoading(false);
                    }}
                    data-testid={tid.img}
                />
            ) : null}
            {isImageLoading ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    Loading...
                </div>
            ) : !imageUrl ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No image available
                </div>
            ) : null}
            {property.isFinancedByARV && (
                <div className="absolute top-2 left-2">
                    <span
                        className={`inline-flex items-center gap-1 ${cfg.arvBadgeTextClass} font-semibold px-3 py-0.5 rounded shadow-sm bg-white text-black`}
                    >
                        <Star className={`${cfg.arvIconClass} fill-black`} />
                        ARV Funded
                    </span>
                </div>
            )}
            <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                {(statusList.filter((s) => s in STATUS_LABEL_MAP).length > 0
                    ? statusList.filter((s) => s in STATUS_LABEL_MAP)
                    : [PROPERTY_STATUS.IN_RENOVATION]
                ).map((s) => (
                    <Badge
                        key={s}
                        variant={STATUS_VARIANT_MAP[s] ?? 'cyan'}
                        size={variant === 'panel' ? 'sm' : 'lg'}
                    >
                        {STATUS_LABEL_MAP[s] ?? 'Renovating'}
                    </Badge>
                ))}
            </div>
        </div>
    );

    // ── Buyer column ───────────────────────────────────────────────────────────
    const buyerColumn = (
        <div className="min-w-0 flex flex-col items-start text-left overflow-hidden">
            <div className="min-w-0 flex-1 w-full overflow-hidden">
                <div className="text-xs text-muted-foreground">Buyer</div>
                <div
                    className={`flex items-center gap-1.5 ${cfg.buyerSellerFontClass} mt-0.5 min-w-0 overflow-hidden w-full`}
                    data-testid={tid.buyerContainer}
                >
                    <Building2 className={`${cfg.buildingIconClass} flex-shrink-0 text-primary`} />
                    {cfg.clickableCompanies && property.buyerId && onCompanyClick ? (
                        <button
                            onClick={() =>
                                onCompanyClick(
                                    property.buyerCompanyName ||
                                        property.companyName ||
                                        property.propertyOwner ||
                                        '',
                                    property.buyerId,
                                    true,
                                )
                            }
                            className="truncate text-primary hover:underline text-left min-w-0"
                            data-testid={tid.buyerCompanyName}
                        >
                            {formatCompanyName(property.buyerCompanyName || '—')}
                        </button>
                    ) : (
                        <span
                            className="truncate text-primary min-w-0"
                            data-testid={tid.buyerCompanyName}
                        >
                            {formatCompanyName(property.buyerCompanyName || '—')}
                        </span>
                    )}
                </div>
                {(property.buyerContactName ||
                    property.buyerContactEmail ||
                    property.buyerContactPhone) && (
                    <div
                        className={`${cfg.contactTextClass} ${cfg.contactSpacingClass} min-w-0 overflow-hidden w-full`}
                    >
                        {property.buyerContactName && (
                            <div
                                className="flex items-center gap-1.5 min-w-0 overflow-hidden"
                                data-testid={tid.buyerContact}
                            >
                                <User className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate text-foreground">
                                    {property.buyerContactName}
                                </span>
                            </div>
                        )}
                        {property.buyerContactEmail && (
                            <a
                                href={`mailto:${property.buyerContactEmail}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:underline min-w-0 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={tid.buyerEmail}
                            >
                                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate">{property.buyerContactEmail}</span>
                            </a>
                        )}
                        {property.buyerContactPhone && (
                            <a
                                href={`tel:${property.buyerContactPhone.replace(/\D/g, '')}`}
                                className="flex items-center gap-1.5 min-w-0 overflow-hidden text-muted-foreground hover:underline"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={tid.buyerPhone}
                            >
                                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate">{property.buyerContactPhone}</span>
                            </a>
                        )}
                    </div>
                )}
                {showSpread && (
                    <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border space-y-0.5 w-fit">
                        <span className="font-medium text-foreground">
                            ${Number(property.buyerPurchasePrice!).toLocaleString()}
                        </span>
                        {formattedBuyerPurchaseDate && (
                            <div className="text-muted-foreground">
                                {formattedBuyerPurchaseDate}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // ── Seller column ──────────────────────────────────────────────────────────
    const sellerColumn = (
        <div className="min-w-0 flex flex-col items-end text-right overflow-hidden">
            <div className="min-w-0 flex-1 w-full flex flex-col items-end overflow-hidden">
                <div className="text-xs text-muted-foreground w-full text-right">Seller</div>
                <div
                    className={`flex items-center justify-end gap-1.5 ${cfg.buyerSellerFontClass} mt-0.5 min-w-0 w-full overflow-hidden`}
                    data-testid={tid.sellerContainer}
                >
                    <span className="min-w-0 flex-1 overflow-hidden flex justify-end">
                        {cfg.clickableCompanies && property.sellerId && onCompanyClick ? (
                            <button
                                onClick={() =>
                                    onCompanyClick(
                                        property.sellerCompanyName || property.sellerName || '',
                                        property.sellerId,
                                        false,
                                    )
                                }
                                className="truncate text-primary hover:underline text-right min-w-0"
                                data-testid={tid.sellerCompanyName}
                            >
                                {formatCompanyName(
                                    property.sellerCompanyName || property.sellerName || '—',
                                )}
                            </button>
                        ) : (
                            <span
                                className="truncate text-primary min-w-0 text-right"
                                title={property.sellerCompanyName || property.sellerName || '—'}
                                data-testid={tid.sellerCompanyName}
                            >
                                {formatCompanyName(
                                    property.sellerCompanyName || property.sellerName || '—',
                                )}
                            </span>
                        )}
                    </span>
                    <Building2 className={`${cfg.buildingIconClass} flex-shrink-0 text-primary`} />
                </div>
                {(property.sellerContactName ||
                    property.sellerContactEmail ||
                    property.sellerContactPhone) && (
                    <div
                        className={`${cfg.contactTextClass} ${cfg.contactSpacingClass} flex flex-col items-end min-w-0 overflow-hidden w-full`}
                    >
                        {property.sellerContactName && (
                            <div
                                className="flex items-center gap-1.5 min-w-0 overflow-hidden justify-end w-full"
                                data-testid={tid.sellerContact}
                            >
                                <span className="truncate min-w-0 text-foreground">
                                    {property.sellerContactName}
                                </span>
                                <User className="w-3.5 h-3.5 flex-shrink-0" />
                            </div>
                        )}
                        {property.sellerContactEmail && (
                            <a
                                href={`mailto:${property.sellerContactEmail}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:underline min-w-0 overflow-hidden justify-end w-full"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={tid.sellerEmail}
                            >
                                <span className="truncate min-w-0">
                                    {property.sellerContactEmail}
                                </span>
                                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                            </a>
                        )}
                        {property.sellerContactPhone && (
                            <a
                                href={`tel:${property.sellerContactPhone.replace(/\D/g, '')}`}
                                className="flex items-center gap-1.5 min-w-0 overflow-hidden text-muted-foreground hover:underline justify-end w-full"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={tid.sellerPhone}
                            >
                                <span className="truncate min-w-0">
                                    {property.sellerContactPhone}
                                </span>
                                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            </a>
                        )}
                    </div>
                )}
                {showSpread && (
                    <div className="text-xs font-medium text-muted-foreground mt-2 pt-2 border-t border-border space-y-0.5 w-fit">
                        <span className="text-foreground">
                            ${Number(property.sellerPurchasePrice!).toLocaleString()}
                        </span>
                        {formattedSellerPurchaseDate && (
                            <div className="text-muted-foreground">
                                {formattedSellerPurchaseDate}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // ── Body content ───────────────────────────────────────────────────────────
    const bodyContent = (
        <div className={isCard ? 'p-4 flex flex-col flex-1' : 'space-y-3'}>
            {/* Main content — flex-1 so spread is pushed to bottom on cards */}
            <div className={isCard ? 'flex-1' : ''}>
                {/* Price + Date */}
                <div className="flex items-start justify-between mb-1">
                    <div>
                        <p className="text-sm text-muted-foreground">{priceLabel}</p>
                        <div className={cfg.priceClass} data-testid={tid.price}>
                            ${property.price.toLocaleString()}
                        </div>
                    </div>
                    <div className={`flex items-start gap-6 ${cfg.dateLabelClass}`}>
                        <div className="flex flex-col items-end" data-testid={tid.dateSold}>
                            <span className={`${cfg.dateLabelClass} text-muted-foreground mb-1`}>
                                {dateLabel}
                            </span>
                            <div className="flex items-center gap-1 font-semibold text-foreground">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>
                                    {formattedDateSold || (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Address */}
                <div>
                    <div className={cfg.addressClass} data-testid={tid.address}>
                        {formatAddress(property.address)}
                    </div>
                    <div className={cfg.cityClass}>
                        {formatAddress(property.city)}, {property.state} {property.zipCode}
                    </div>
                </div>

                {/* Beds / Baths / Sqft */}
                <div className={cfg.bedsContainerClass}>
                    <div className="flex items-center gap-1" data-testid={tid.beds}>
                        <Bed className="w-4 h-4 text-muted-foreground" />
                        <span>{property.bedrooms} bd</span>
                    </div>
                    <div className="flex items-center gap-1" data-testid={tid.baths}>
                        <Bath className="w-4 h-4 text-muted-foreground" />
                        <span>{property.bathrooms} ba</span>
                    </div>
                    <div className="flex items-center gap-1" data-testid={tid.sqft}>
                        <Maximize2 className="w-4 h-4 text-muted-foreground" />
                        <span>{property.squareFeet.toLocaleString()} sqft</span>
                    </div>
                </div>

                {/* Property type */}
                <div className={cfg.propertyTypeClass}>{property.propertyType}</div>

                {/* Price/sqft + days owned (detail only) */}
                {cfg.showMeta && (property.squareFeet > 0 || daysOwned !== null) && (
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={tid.meta}>
                        {[
                            property.squareFeet > 0 && `$${pricePerSqft}/sqft`,
                            daysOwned !== null && `${daysOwned} days owned`,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                )}

                {/* Buyer / Seller */}
                <div
                    className={`mt-3 pt-3 border-t grid grid-cols-2 ${cfg.gridGapClass} items-stretch`}
                >
                    {buyerColumn}
                    {sellerColumn}
                </div>

                {/* Assignor (shown when an assignment tx sits between the 2 most recent arms-length txs) */}
                {property.assignorCompanyName && (
                    <div className="mt-2 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm text-muted-foreground">Assigned by</span>
                            {cfg.clickableCompanies && property.assignorId && onCompanyClick ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCompanyClick(
                                            property.assignorCompanyName!,
                                            property.assignorId!,
                                            false,
                                        );
                                    }}
                                    className="text-sm font-medium text-primary hover:underline truncate"
                                    data-testid={tid.assignorCompanyName}
                                >
                                    {formatCompanyName(property.assignorCompanyName)}
                                </button>
                            ) : (
                                <span
                                    className="text-sm font-medium text-primary truncate"
                                    data-testid={tid.assignorCompanyName}
                                >
                                    {formatCompanyName(property.assignorCompanyName)}
                                </span>
                            )}
                        </div>
                        {(property.assignorContactName ||
                            property.assignorContactEmail ||
                            property.assignorContactPhone) && (
                            <div
                                className={`${cfg.contactTextClass} space-y-0.5 flex flex-col items-center`}
                            >
                                {property.assignorContactName && (
                                    <div
                                        className="flex items-center gap-1.5"
                                        data-testid={tid.assignorContact}
                                    >
                                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="text-foreground">
                                            {property.assignorContactName}
                                        </span>
                                    </div>
                                )}
                                {property.assignorContactEmail && (
                                    <a
                                        href={`mailto:${property.assignorContactEmail}`}
                                        className="flex items-center gap-1.5 text-muted-foreground hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                        data-testid={tid.assignorEmail}
                                    >
                                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>{property.assignorContactEmail}</span>
                                    </a>
                                )}
                                {property.assignorContactPhone && (
                                    <a
                                        href={`tel:${property.assignorContactPhone.replace(/\D/g, '')}`}
                                        className="flex items-center gap-1.5 text-muted-foreground hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                        data-testid={tid.assignorPhone}
                                    >
                                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>{property.assignorContactPhone}</span>
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {/* Lender (ARV team only) */}
                {canAccessAdminPanel && property.lenderName && (
                    <div className="mt-2 flex items-center justify-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">Lender:</span>
                        <span className="text-sm font-medium text-foreground truncate">
                            {formatCompanyName(property.lenderName)}
                        </span>
                    </div>
                )}
                {/* Financing type (non-ARV team members) */}
                {!canAccessAdminPanel && (
                    <div className="mt-2 flex items-center justify-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                            {property.lenderName ? 'Hard Money Transaction' : 'Cash Transaction'}
                        </span>
                    </div>
                )}
            </div>
            {/* end flex-1 main content */}

            {/* Spread */}
            {showSpread && (
                <div className="mt-3 flex justify-center items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                        {spreadLabel}:
                    </span>
                    <span
                        className={`text-sm font-semibold ${
                            isNegative(property.spread!)
                                ? 'text-spread-negative'
                                : 'text-spread-positive'
                        }`}
                        data-testid={tid.spread}
                    >
                        {isNegative(property.spread!) ? '-' : cfg.spreadPositivePrefix}$
                        {Number(Math.abs(property.spread!)).toLocaleString()}
                    </span>
                </div>
            )}

            {/* Supplemental tax bill (admin/owner only) */}
            {supplementalTaxBill !== null && (
                <div className="mt-1 flex justify-center items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                        Supplemental Tax Bill:
                    </span>
                    <span
                        className={`text-sm font-semibold ${
                            isNegative(supplementalTaxBill)
                                ? 'text-spread-negative'
                                : 'text-spread-positive'
                        }`}
                        data-testid={tid.supplementalTax}
                    >
                        {isNegative(supplementalTaxBill) ? '-' : cfg.spreadPositivePrefix}$
                        {Math.abs(supplementalTaxBill).toLocaleString()}
                    </span>
                </div>
            )}

            {/* Edit + Delete (detail + admin only) */}
            {isDetail && isAdminOrOwner && (
                <div className="pt-4 space-y-2">
                    {onEditClick && (
                        <Button
                            variant="outline"
                            onClick={onEditClick}
                            className="w-full"
                            data-testid="button-edit-property"
                        >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Property
                        </Button>
                    )}
                    {onDeleteClick && (
                        <Button
                            variant="destructive"
                            onClick={onDeleteClick}
                            disabled={deleteIsPending}
                            className="w-full"
                            data-testid="button-delete-property"
                        >
                            Delete Property
                        </Button>
                    )}
                </div>
            )}
        </div>
    );

    // ── Outer layout ───────────────────────────────────────────────────────────
    if (isCard) {
        return (
            <div className="flex flex-col h-full">
                {imageSection}
                {bodyContent}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {imageSection}
            {bodyContent}
        </div>
    );
}
