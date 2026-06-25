import { MarketingHeader } from '@/components/MarketingHeader';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AuthPageShellProps = {
    title: string;
    description: string;
    children: React.ReactNode;
};

// Renders the public marketing header above a centered auth card, so /login, /signup,
// /forgot-password, and /reset-password share the same clean, logged-out chrome as the home page.
export function AuthPageShell({ title, description, children }: AuthPageShellProps) {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <MarketingHeader />
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
    );
}
