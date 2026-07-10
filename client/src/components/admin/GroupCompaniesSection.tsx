import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Building2, X } from 'lucide-react';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { parseApiError } from '@/utils/apiError';
import AsyncSearchSelect, { type SearchOption } from '@/components/admin/AsyncSearchSelect';
import type { GroupCompany } from '@shared/types/groups';

type CompanySuggestion = {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
};

type GroupCompaniesSectionProps = {
    groupId: string;
    companies: GroupCompany[];
};

const SEARCH_DEBOUNCE_MS = 300;

/** Companies belonging to a group: an add-by-search picker plus a removable list. */
export default function GroupCompaniesSection({ groupId, companies }: GroupCompaniesSectionProps) {
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

    const { data: suggestions = [], isFetching } = useQuery<CompanySuggestion[]>({
        queryKey: [`/api/companies/contacts/suggestions?search=${encodeURIComponent(debounced)}`],
        enabled: debounced.length >= 2,
    });

    const addMutation = useMutation({
        mutationFn: async (companyId: string) => {
            const res = await apiRequest('POST', `/api/groups/${groupId}/companies`, { companyId });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            setSearch('');
            toast({ title: 'Company added to group' });
        },
        onError: (error) =>
            toast({
                title: 'Could not add company',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    const removeMutation = useMutation({
        mutationFn: async (companyId: string) => {
            const res = await apiRequest(
                'DELETE',
                `/api/groups/${groupId}/companies/${companyId}`,
            );
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({ title: 'Company removed from group' });
        },
        onError: (error) =>
            toast({
                title: 'Could not remove company',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    // Hide companies already in this group from the picker (adding one that's here is a no-op).
    const existingIds = new Set(companies.map((c) => c.id));
    const options: SearchOption[] = suggestions
        .filter((s) => !existingIds.has(s.id))
        .map((s) => ({ id: s.id, label: formatCompanyName(s.companyName) ?? s.companyName }));

    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Companies ({companies.length})</h3>
            </div>

            <AsyncSearchSelect
                placeholder="Search companies to add..."
                search={search}
                onSearchChange={setSearch}
                options={options}
                onSelect={(option) => addMutation.mutate(option.id)}
                isLoading={isFetching}
                disabled={addMutation.isPending}
                emptyText={
                    debounced.length < 2 ? 'Type at least 2 characters' : 'No companies found'
                }
            />
            <p className="text-xs text-muted-foreground">
                A company that already belongs to another group is moved here (one group per
                company).
            </p>

            {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No companies in this group yet.</p>
            ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                    {companies.map((company) => (
                        <li
                            key={company.id}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                            <span className="text-sm">{formatCompanyName(company.companyName)}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${formatCompanyName(company.companyName)}`}
                                disabled={removeMutation.isPending}
                                onClick={() => removeMutation.mutate(company.id)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
