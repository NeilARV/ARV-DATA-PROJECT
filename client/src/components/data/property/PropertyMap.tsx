import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { X, Loader2, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapLegend } from '@/components/data/property/MapLegend';
import {
    getIconForPin,
    statusLabel,
    createClusterIcon,
    clusterRadiusForZoom,
    createRegionIcon,
} from '@/components/data/property/mapIcons';
import {
    ViewportWatcher,
    ZoomLockController,
    CameraController,
    MapResizeHandler,
} from '@/components/data/property/mapControllers';
import { useFilters } from '@/hooks/useFilters';
import { useCompanies } from '@/hooks/useCompanies';
import { useGeoMap, type MsaRegionBubble } from '@/hooks/useMap';
import { useProperty } from '@/hooks/useProperty';
import { getCountyCenter, getDefaultMapCenter } from '@/lib/county';
import { MAP_ZOOM_COUNTY, MAP_ZOOM_FLOOR, MAP_DECLUSTER_ZOOM } from '@/constants/map.constants';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { MapPin } from '@/types/property';

type RenderPin = { pin: MapPin; position: [number, number] };

/**
 * Interactive property map: clustered, viewport-fetched pins over theme-aware CARTO basemaps, with a
 * color legend, hover tooltips, and loading/empty states.
 */
export default function PropertyMap() {
    const { filters, setFilters, clearFilters, hasActiveFilters } = useFilters();
    const { fetchProperty, property } = useProperty();
    const { company, setCompany } = useCompanies();
    const {
        filteredMapPins = [],
        isLoadingMapPins = false,
        extent,
        regionBubbles = [],
        isOverview = false,
        mapCenter,
        mapZoom,
        setMapBounds,
        setMapCenter,
        setMapZoom,
        isRegionLocked = true,
        setRegionLocked,
    } = useGeoMap({ fetchMapPins: true });

    const renderPins = useMemo<RenderPin[]>(() => {
        return filteredMapPins
            .map((pin): RenderPin | null => {
                const { latitude, longitude } = pin;
                if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
                    return null;
                }
                return { pin, position: [latitude, longitude] };
            })
            .filter((entry): entry is RenderPin => entry !== null);
    }, [filteredMapPins]);

    // MapContainer reads center/zoom once at mount; CameraController drives changes after that.
    const initialCenter =
        mapCenter ?? getCountyCenter(filters.county ?? 'San Diego') ?? getDefaultMapCenter();
    const initialZoom = mapZoom ?? MAP_ZOOM_COUNTY;

    const tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const tileAttribution =
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const hasAnyMatches = (extent?.count ?? 0) > 0;
    const showEmptyState = !isOverview && !isLoadingMapPins && renderPins.length === 0;
    const emptyMessage = hasAnyMatches
        ? 'No properties in this area — zoom out or pan the map.'
        : 'No properties match your filters.';

    // Clicking a national-overview bubble locks into that metro: switches the county filter, unlocks
    // detail zoom, and drops the camera onto the region (the extent then frames its properties).
    function handleRegionClick(region: MsaRegionBubble) {
        setCompany(null);
        setFilters((prev) => ({
            ...prev,
            county: region.county,
            zipCode: '',
            city: undefined,
            companyRole: undefined,
        }));
        setRegionLocked(true);
        setMapCenter(region.center);
        setMapZoom(MAP_ZOOM_COUNTY);
    }

    return (
        <div className="w-full h-full relative" data-testid="map-container">
            {(hasActiveFilters || company) && (
                <div className="absolute top-2 left-12 z-[501] flex flex-col gap-1">
                    {company && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => setCompany(null)}
                            className="shadow-lg h-8 px-2 text-xs"
                            data-testid="button-deselect-company-map"
                        >
                            <X className="w-3 h-2.5 mr-1.5" />
                            Deselect Company
                        </Button>
                    )}
                    {hasActiveFilters && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => clearFilters()}
                            className="shadow-lg h-8 px-2 text-xs"
                            data-testid="button-clear-filters-map"
                        >
                            <X className="w-3 h-2.5 mr-1.5" />
                            Clear Filters
                        </Button>
                    )}
                </div>
            )}

            {isLoadingMapPins && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm pointer-events-none">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading map pins…
                </div>
            )}

            {showEmptyState && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
                    <div className="rounded-md border border-border bg-background/90 px-4 py-3 text-sm text-muted-foreground backdrop-blur-sm">
                        {emptyMessage}
                    </div>
                </div>
            )}

            {isOverview && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 rounded-md border border-border bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur-sm pointer-events-none">
                    <MousePointerClick className="w-4 h-4 text-primary" />
                    Select a region to dive deeper
                </div>
            )}

            <MapContainer
                center={initialCenter}
                zoom={initialZoom}
                minZoom={MAP_ZOOM_FLOOR}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution={tileAttribution}
                    url={tileUrl}
                    subdomains="abc"
                    detectRetina
                />
                <MapResizeHandler />
                <ViewportWatcher onBoundsChange={setMapBounds} />
                <ZoomLockController
                    locked={isRegionLocked}
                    onUnlock={() => setRegionLocked(false)}
                />
                <CameraController center={mapCenter} zoom={mapZoom} />

                {isOverview ? (
                    regionBubbles.map((region) => (
                        <Marker
                            key={region.msa}
                            position={region.center}
                            icon={createRegionIcon(region.count, region.offset)}
                            eventHandlers={{ click: () => handleRegionClick(region) }}
                        >
                            <Tooltip direction="top">
                                <div className="text-xs">
                                    <div className="font-semibold">{region.label}</div>
                                    <div className="text-muted-foreground">
                                        {region.count.toLocaleString()} properties — click to view
                                    </div>
                                </div>
                            </Tooltip>
                        </Marker>
                    ))
                ) : (
                    <MarkerClusterGroup
                        chunkedLoading
                        maxClusterRadius={clusterRadiusForZoom}
                        showCoverageOnHover={false}
                        disableClusteringAtZoom={MAP_DECLUSTER_ZOOM}
                        spiderfyOnMaxZoom
                        iconCreateFunction={createClusterIcon}
                    >
                        {renderPins.map(({ pin, position }) => {
                            const isSelected = property?.id === pin.id;
                            return (
                                <Marker
                                    key={pin.id}
                                    position={position}
                                    icon={getIconForPin({
                                        pin,
                                        isSelected,
                                        selectedCompanyId: company?.id ?? null,
                                        statusFilters: filters.statusFilters,
                                    })}
                                    eventHandlers={{ click: () => fetchProperty?.(pin.id) }}
                                >
                                    <Tooltip direction="top">
                                        <div className="text-xs">
                                            <div className="font-semibold">
                                                {pin.address || 'Address unavailable'}
                                            </div>
                                            {(pin.city || pin.zipcode) && (
                                                <div className="text-muted-foreground">
                                                    {[pin.city, pin.zipcode]
                                                        .filter(Boolean)
                                                        .join(', ')}
                                                </div>
                                            )}
                                            <div>
                                                {statusLabel(pin.status)}
                                                {pin.price > 0 &&
                                                    ` · $${pin.price.toLocaleString()}`}
                                            </div>
                                            {pin.propertyOwner && (
                                                <div className="text-muted-foreground">
                                                    {formatCompanyName(pin.propertyOwner)}
                                                </div>
                                            )}
                                        </div>
                                    </Tooltip>
                                </Marker>
                            );
                        })}
                    </MarkerClusterGroup>
                )}
            </MapContainer>

            {!isOverview && <MapLegend />}
        </div>
    );
}
