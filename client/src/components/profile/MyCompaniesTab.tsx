import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { UserGroupCompany } from '@shared/types/groups';

export default function MyCompaniesTab() {
    const { data, isLoading } = useQuery<{ data: UserGroupCompany[]; count: number }>({
        queryKey: ['/api/users/me/company-memberships'],
        queryFn: async () => {
            const res = await apiRequest('GET', '/api/users/me/company-memberships');
            if (!res.ok) throw new Error('Failed to fetch companies');
            return res.json();
        },
    });

    const companies = data?.data ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    My Companies
                </CardTitle>
                <CardDescription>
                    Companies you're associated with through your group(s).
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                    </div>
                ) : companies.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                        You're not associated with any companies yet. An admin adds you to a
                        company's group to grant access.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {companies.map((c) => (
                            <div
                                key={c.companyId}
                                className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30"
                            >
                                <div>
                                    <div className="font-medium text-sm text-foreground">
                                        {formatCompanyName(c.companyName)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {formatCompanyName(c.groupName)}
                                        {' · Joined '}
                                        {format(new Date(c.joinedAt), 'MMM d, yyyy')}
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
