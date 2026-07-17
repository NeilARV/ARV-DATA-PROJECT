import type { ReactNode } from 'react';

import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { GroupsProvider } from '@/hooks/useGroups';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';

import type { PropertyFilters } from '@/types/filters';

type DataProvidersProps = {
    children: ReactNode;
    /** Optional initial overrides for default filters (e.g. the URL/user county on Home) */
    filtersDefaultOverrides?: Partial<PropertyFilters>;
};

/**
 * The Data-app context stack (map, filters, companies, properties, selected property) that every
 * Data-aware page mounts. Wrap a page in this instead of repeating the five nested providers.
 */
export function DataProviders({ children, filtersDefaultOverrides }: DataProvidersProps) {
    return (
        <MapProvider>
            <FiltersProvider defaultOverrides={filtersDefaultOverrides}>
                <CompaniesProvider>
                    <GroupsProvider>
                        <PropertiesProvider>
                            <PropertyProvider>{children}</PropertyProvider>
                        </PropertiesProvider>
                    </GroupsProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}
