import { useEffect, useRef } from "react";
import { COUNTIES } from "@/constants/filters.constants";
import { MAP_ZOOM_DEFAULT } from "@/constants/map.constants";
import { getCountyCenter, getDefaultMapCenter } from "@/lib/county";

type SetMapCenter = (center: [number, number] | undefined) => void;
type SetMapZoom = (zoom: number) => void;

/**
 * Runs geolocation once on mount and sets map center/zoom to user location
 * (or default county if outside enabled counties). Only attempts once per session.
 */
export function useGeolocationMapCenter(
  setMapCenter: SetMapCenter,
  setMapZoom: SetMapZoom
): void {
  const attemptedRef = useRef(false);
  
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    if (!navigator.geolocation) {
      setMapCenter(getDefaultMapCenter());
      setMapZoom(MAP_ZOOM_DEFAULT);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `/api/geocoding/county?longitude=${longitude}&latitude=${latitude}`,
            { credentials: "include" }
          );
          if (!response.ok) throw new Error(`Failed to fetch county: ${response.status}`);
          const data = await response.json();
          const userCounty = data.county;

          if (userCounty) {
            const enabledCounties = COUNTIES.map((c) => c.county);
            const isEnabledCounty = enabledCounties.some(
              (enabledCounty) =>
                enabledCounty.toLowerCase() === userCounty.toLowerCase()
            );
            if (isEnabledCounty) {
              setMapCenter([latitude, longitude]);
              setMapZoom(MAP_ZOOM_DEFAULT);
            } else {
              const defaultCounty = enabledCounties[0] ?? "San Diego";
              const defaultCenter =
                getCountyCenter(defaultCounty) ?? getDefaultMapCenter();
              setMapCenter(defaultCenter);
              setMapZoom(MAP_ZOOM_DEFAULT);
            }
          } else {
            setMapCenter([latitude, longitude]);
            setMapZoom(MAP_ZOOM_DEFAULT);
          }
        } catch {
          setMapCenter([latitude, longitude]);
          setMapZoom(MAP_ZOOM_DEFAULT);
        }
      },
      () => {
        setMapCenter(getDefaultMapCenter());
        setMapZoom(MAP_ZOOM_DEFAULT);
      }
    );
  }, [setMapCenter, setMapZoom]);
}
