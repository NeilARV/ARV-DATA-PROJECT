import { useLocation } from 'wouter';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import darkLogoUrl from '@assets/arv-data-logo-dark.png';
import lightLogoUrl from '@assets/arv-data-logo-light.png';

type AuthPageShellProps = {
    title: string;
    description: string;
    children: React.ReactNode;
};

export function AuthPageShell({ title, description, children }: AuthPageShellProps) {
    const [, setLocation] = useLocation();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
            <button
                type="button"
                className="mb-6 hover:opacity-80 transition-opacity"
                onClick={() => setLocation('/')}
                aria-label="Go to home"
            >
                <img src={darkLogoUrl} alt="ARV DATA" className="h-12 w-auto dark:hidden" />
                <img
                    src={lightLogoUrl}
                    alt="ARV DATA"
                    className="h-12 w-auto hidden dark:block"
                />
            </button>

            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-lg">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">{children}</CardContent>
            </Card>
        </div>
    );
}
