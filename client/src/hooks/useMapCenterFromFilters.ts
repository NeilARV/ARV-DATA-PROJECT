import { useEffect, MutableRefObject } from "react";
import type { PropertyFilters } from "@/types/filters";
import type { MapPin } from "@/types/property";
import {
  SAN_DIEGO_MSA_ZIP_CODES,
  LOS_ANGELES_MSA_ZIP_CODES,
  DENVER_MSA_ZIP_CODES,
} from "@/constants/filters.constants";
import {
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_COUNTY,
  MAP_ZOOM_CITY,
  MAP_ZOOM_ZIP,
  MAP_ZOOM_SINGLE_PROPERTY,
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX,
} from "@/constants/map.constants";
import { getCountyCenter, getStateFromCounty, countyNameToKey } from "@/lib/county";
import { cityMatchesFilter } from "@/lib/propertyFilters";

type SetMapCenter = (center: [number, number] | undefined) => void;
type SetMapZoom = (zoom: number) => void;

export interface UseMapCenterFromFiltersOptions {
  filters: PropertyFilters;
  selectedCompany: string | null;
  filteredMapPins: MapPin[];
  setMapCenter: SetMapCenter;
  setMapZoom: SetMapZoom;
  companySelectionInProgressRef: MutableRefObject<boolean>;
}

/**
 * Effect 1: When filters (zip/city/county) or selectedCompany change, update map center/zoom
 * from location (zip > city > county). Skips when a company is selected or selection in progress.
 *
 * Effect 2: When a company is selected and filteredMapPins are available, center map on
 * company properties and set zoom from spread.
 */
export function useMapCenterFromFilters({
  filters,
  selectedCompany,
  filteredMapPins,
  setMapCenter,
  setMapZoom,
  companySelectionInProgressRef,
}: UseMapCenterFromFiltersOptions): void {
  // Effect 1: Map center from filters (zip / city / county)
  useEffect(() => {
    const fetchLocation = async () => {
      if (selectedCompany || companySelectionInProgressRef.current) return;

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
        const state = getStateFromCounty(countyName);
        const countyKey = countyNameToKey(countyName);
        let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
        if (state === "CA") {
          msaZipCodes =
            countyName === "Los Angeles" || countyName === "Orange"
              ? LOS_ANGELES_MSA_ZIP_CODES
              : SAN_DIEGO_MSA_ZIP_CODES;
        } else if (state === "CO") {
          msaZipCodes = DENVER_MSA_ZIP_CODES;
        } else {
          msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
        }
        const currentZipCodeList = msaZipCodes[countyKey] ?? [];
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

      if (!selectedCompany) {
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

    fetchLocation();
  }, [
    filters?.zipCode,
    filters?.city,
    filters?.county,
    selectedCompany,
    companySelectionInProgressRef,
    setMapCenter,
    setMapZoom,
  ]);

  // Effect 2: Center map on company properties when a company is selected
  useEffect(() => {
    if (!selectedCompany) {
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
  }, [
    selectedCompany,
    filteredMapPins,
    setMapCenter,
    setMapZoom,
    companySelectionInProgressRef,
  ]);
}
