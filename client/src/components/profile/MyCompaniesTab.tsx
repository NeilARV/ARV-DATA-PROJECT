import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { UserMembership } from '@shared/types/claims';

export default function MyCompaniesTab() {
    const { data, isLoading } = useQuery<{ data: UserMembership[]; count: number }>({
        queryKey: ['/api/users/me/company-memberships'],
        queryFn: async () => {
            const res = await apiRequest('GET', '/api/users/me/company-memberships');
            if (!res.ok) throw new Error('Failed to fetch memberships');
            return res.json();
        },
    });

    const memberships = data?.data ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    My Companies
                </CardTitle>
                <CardDescription>Companies you have claimed on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                    </div>
                ) : memberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                        You haven't claimed any companies yet. Find a company in the directory and
                        click "Claim This Company."
                    </p>
                ) : (
                    <div className="space-y-3">
                        {memberships.map((m) => (
                            <div
                                key={m.companyId}
                                className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30"
                            >
                                <div>
                                    <div className="font-medium text-sm text-foreground">
                                        {formatCompanyName(m.companyName)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                                        {m.role ?? 'member'}
                                        {m.isPrimary ? ' · Primary' : ''}
                                        {' · Joined '}
                                        {format(new Date(m.joinedAt), 'MMM d, yyyy')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
