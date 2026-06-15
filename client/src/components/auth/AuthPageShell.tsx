import Header from '@/components/Header';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';

type AuthPageShellProps = {
    title: string;
    description: string;
    children: React.ReactNode;
};

// Renders the full site Header (which depends on the data-app context providers)
// above a centered auth card. Mirrors the provider stack used by Deals/Home so the
// header's navigation works the same on /login, /signup, /forgot-password, /reset-password.
export function AuthPageShell({ title, description, children }: AuthPageShellProps) {
    return (
        <MapProvider>
            <FiltersProvider>
                <CompaniesProvider>
                    <PropertiesProvider>
                        <PropertyProvider>
                            <div className="min-h-screen flex flex-col bg-background">
                                <Header />
                                <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
                                    <Card className="w-full max-w-md">
                                        <CardHeader>
                                            <CardTitle className="text-lg">{title}</CardTitle>
                                            <CardDescription>{description}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">{children}</CardContent>
                                    </Card>
                                </div>
                            </div>
                        </PropertyProvider>
                    </PropertiesProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}
