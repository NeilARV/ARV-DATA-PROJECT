import { createContext, useState, useMemo, useEffect, ReactNode, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MapPin } from "@/types/property";
import { COUNTIES } from "@/constants/filters.constants";
import {
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_COUNTY,
  MAP_ZOOM_CITY,
  MAP_ZOOM_ZIP,
  MAP_ZOOM_SINGLE_PROPERTY,
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX,
} from "@/constants/map.constants";
import {
  getCountyCenter,
  getDefaultMapCenter,
  getZipCodesForCounty,
} from "@/lib/county";
import { cityMatchesFilter, matchesFiltersForPin } from "@/lib/propertyFilters";
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { useCompanies } from "./useCompanies";
import { useFilters } from "./useFilters";
import { useView } from "./useView";

export type MapContextValue = {
  mapCenter: [number, number] | undefined;
  setMapCenter: React.Dispatch<
    React.SetStateAction<[number, number] | undefined>
  >;
  mapZoom: number | undefined;
  setMapZoom: React.Dispatch<React.SetStateAction<number | undefined>>;
};

const MapContext = createContext<MapContextValue | null>(null);

type MapProviderProps = {
  children: ReactNode;
};

export function MapProvider({ children }: MapProviderProps) {
  const [mapCenter, setMapCenter] = useState<
    [number, number] | undefined
  >(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(12);

  const value = useMemo<MapContextValue>(
    () => ({
      mapCenter,
      setMapCenter,
      mapZoom,
      setMapZoom,
    }),
    [mapCenter, mapZoom]
  );

  return (
    <MapContext.Provider value={value}>{children}</MapContext.Provider>
  );
}

export type UseGeoMapOptions = {
  /** When true, fetches map pins (when view === "map"), computes filteredMapPins, runs sync effects, and returns mapPins, filteredMapPins, isLoadingMapPins. */
  fetchMapPins?: boolean;
};

export type UseGeoMapResult = MapContextValue & {
  mapPins?: MapPin[];
  filteredMapPins?: MapPin[];
  isLoadingMapPins?: boolean;
};

/**
 * Returns map center and zoom state. When called with `{ fetchMapPins: true }`, also:
 * - Fetches map pins from the API (when view === "map")
 * - Computes filteredMapPins from filters/company
 * - Runs filter-based and company-based center/zoom sync
 * - Returns mapPins, filteredMapPins, isLoadingMapPins
 */
export function useGeoMap(options?: UseGeoMapOptions): UseGeoMapResult {
  const ctx = useContext(MapContext);
  if (!ctx) {
    throw new Error("useGeoMap must be used within a MapProvider");
  }

  const { setMapCenter, setMapZoom } = ctx;
  const { company, companySelectionInProgressRef } = useCompanies();
  const { filters, sortBy } = useFilters();
  const { view } = useView();

  const fetchMapPins = options?.fetchMapPins === true;

  // Map pins URL and fetch (only when fetchMapPins and view === "map")
  const mapPinsQueryUrl = useMemo(() => {
    if (!fetchMapPins) return "";
    const queryString = buildPropertyQueryParams(filters, {
      forMapPins: true,
      page: 1,
      limit: "10",
    }, { company, sortBy });
    return `/api/properties/map${queryString}`;
  }, [fetchMapPins, filters.county, filters.statusFilters, company?.id, filters.dateRange]);

  const { data: mapPins = [], isLoading: isLoadingMapPins } = useQuery<MapPin[]>({
    queryKey: [mapPinsQueryUrl],
    queryFn: async () => {
      const res = await fetch(mapPinsQueryUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch map pins: ${res.status}`);
      return res.json();
    },
    enabled: fetchMapPins && !!mapPinsQueryUrl && view === "map",
    staleTime: 5 * 60 * 1000,
  });

  // Zip code list for filtering pins
  const zipCodeList = useMemo(() => {
    if (!fetchMapPins) return [];
    return getZipCodesForCounty(filters.county ?? "San Diego");
  }, [fetchMapPins, filters.county]);

  const filteredMapPins = useMemo(() => {
    if (!fetchMapPins) return [];
    return mapPins.filter((pin) =>
      matchesFiltersForPin(pin, zipCodeList, filters, company)
    );
  }, [fetchMapPins, mapPins, filters, company, zipCodeList]);

  const syncActive = fetchMapPins;

  // Filter-based center/zoom: when zip, city, county, or company (clear) change. Skip when company selected or selection in progress.
  useEffect(() => {
    if (!syncActive) return;

    const applyLocationFromFilters = async () => {
      if (company || companySelectionInProgressRef.current) return;

      if (filters?.zipCode?.trim()) {
        try {
          const response = await fetch(
            `https://api.zippopotam.us/us/${filters.zipCode.trim()}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.places?.length > 0) {
              const lat = parseFloat(data.places[0].latitude);
              const lng = parseFloat(data.places[0].longitude);
              setMapCenter([lat, lng]);
              setMapZoom(MAP_ZOOM_ZIP);
              return;
            }
          }
        } catch (error) {
          console.error("Error fetching zip code location:", error);
        }
      }

      if (filters?.city?.trim()) {
        const countyName = filters?.county ?? "San Diego";
        const currentZipCodeList = getZipCodesForCounty(countyName);
        const cityZipCodes = currentZipCodeList.filter((z) =>
          cityMatchesFilter(filters.city!, z.city)
        );
        if (cityZipCodes.length > 0) {
          try {
            const response = await fetch(
              `https://api.zippopotam.us/us/${cityZipCodes[0].zip}`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.places?.length > 0) {
                const lat = parseFloat(data.places[0].latitude);
                const lng = parseFloat(data.places[0].longitude);
                setMapCenter([lat, lng]);
                setMapZoom(MAP_ZOOM_CITY);
                return;
              }
            }
          } catch (error) {
            console.error("Error fetching city location:", error);
          }
        }
      }

      if (filters?.county?.trim()) {
        const countyCenter = getCountyCenter(filters.county);
        if (countyCenter) {
          setMapCenter(countyCenter);
          setMapZoom(MAP_ZOOM_COUNTY);
          return;
        }
      }

      if (!company) {
        const defaultCounty = filters?.county ?? "San Diego";
        const countyCenter = getCountyCenter(defaultCounty);
        if (countyCenter) {
          setMapCenter(countyCenter);
          setMapZoom(MAP_ZOOM_COUNTY);
        } else {
          setMapCenter(undefined);
          setMapZoom(MAP_ZOOM_DEFAULT);
        }
      }
    };

    applyLocationFromFilters();
  }, [
    filters?.zipCode,
    filters?.city,
    filters?.county,
    company,
  ]);

  // Company-based center/zoom: when company is selected and we have pins
  useEffect(() => {
    if (!syncActive) return;

    if (!company) {
      companySelectionInProgressRef.current = false;
      return;
    }
    companySelectionInProgressRef.current = true;

    if (filteredMapPins.length === 0) return;

    const validPins = filteredMapPins.filter(
      (p) =>
        p.latitude != null &&
        p.longitude != null &&
        !isNaN(p.latitude) &&
        !isNaN(p.longitude)
    );

    if (validPins.length === 0) return;

    const avgLat =
      validPins.reduce((sum, p) => sum + p.latitude!, 0) / validPins.length;
    const avgLng =
      validPins.reduce((sum, p) => sum + p.longitude!, 0) / validPins.length;

    if (isNaN(avgLat) || isNaN(avgLng)) return;

    setMapCenter([avgLat, avgLng]);

    let calculatedZoom = 10;
    if (validPins.length > 1) {
      const lats = validPins.map((p) => p.latitude!);
      const lngs = validPins.map((p) => p.longitude!);
      const maxSpan = Math.max(
        Math.max(...lats) - Math.min(...lats),
        Math.max(...lngs) - Math.min(...lngs)
      );
      const paddedSpan = maxSpan * 1.5;
      if (paddedSpan < 0.005) calculatedZoom = 17;
      else if (paddedSpan < 0.01) calculatedZoom = 16;
      else if (paddedSpan < 0.02) calculatedZoom = 15;
      else if (paddedSpan < 0.05) calculatedZoom = 14;
      else if (paddedSpan < 0.1) calculatedZoom = 13;
      else if (paddedSpan < 0.2) calculatedZoom = 12;
      else if (paddedSpan < 0.5) calculatedZoom = 11;
      else calculatedZoom = MAP_ZOOM_COUNTY;
    } else {
      calculatedZoom = MAP_ZOOM_SINGLE_PROPERTY;
    }
    calculatedZoom = Math.max(
      MAP_ZOOM_MIN,
      Math.min(MAP_ZOOM_MAX, calculatedZoom)
    );
    setMapZoom(calculatedZoom);
    companySelectionInProgressRef.current = false;
  }, [company, filteredMapPins]);

  if (fetchMapPins) {
    return {
      ...ctx,
      mapPins,
      filteredMapPins,
      isLoadingMapPins,
    };
  }
  return ctx;
}
