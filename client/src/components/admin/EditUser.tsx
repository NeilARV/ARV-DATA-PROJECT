import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { AdminUser, AccountTypeOption } from '@/types/admin';
import type { RelationshipManager } from '@shared/types/users';

interface CompanyOption {
    id: string;
    companyName: string;
}

const SUBSCRIPTION_TIERS = ['basic', 'pro', 'premium'] as const;
const NO_VALUE = '__none__';

export type EditUserContentProps = {
    user: AdminUser;
    relationshipManagers: RelationshipManager[];
    accountTypesList: AccountTypeOption[];
    onClose: () => void;
    onSuccess?: () => void;
};

export default function EditUserContent({
    user,
    relationshipManagers,
    accountTypesList,
    onClose,
    onSuccess,
}: EditUserContentProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [selectedRmId, setSelectedRmId] = useState<string | null>(
        user.relationshipManagers?.[0]?.id ?? null,
    );
    const [selectedTier, setSelectedTier] = useState<string | null>(user.subscriptionTier);
    const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>(
        user.accountTypes ?? [],
    );

    const [selectedCompanies, setSelectedCompanies] = useState<CompanyOption[]>([]);
    const [companySearch, setCompanySearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initializedRef = useRef(false);

    const { data: membershipsResponse } = useQuery<{
        data: Array<{ companyId: string; companyName: string }>;
    }>({
        queryKey: [`/api/users/${user.id}/company-memberships`],
    });

    useEffect(() => {
        if (membershipsResponse?.data && !initializedRef.current) {
            setSelectedCompanies(
                membershipsResponse.data.map((m) => ({
                    id: m.companyId,
                    companyName: m.companyName,
                })),
            );
            initializedRef.current = true;
        }
    }, [membershipsResponse]);

    useEffect(() => {
        return () => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        };
    }, []);

    const trimmedSearch = companySearch.trim();
    const { data: suggestions } = useQuery<CompanyOption[]>({
        queryKey: [
            `/api/companies/contacts/suggestions?search=${encodeURIComponent(trimmedSearch)}`,
        ],
        enabled: trimmedSearch.length >= 2,
        staleTime: 30_000,
    });

    const filteredSuggestions = (suggestions ?? []).filter(
        (s) => !selectedCompanies.some((c) => c.id === s.id),
    );

    const addCompany = (company: CompanyOption) => {
        setSelectedCompanies((prev) => [...prev, company]);
        setCompanySearch('');
        setShowSuggestions(false);
    };

    const availableAccountTypes = accountTypesList.filter(
        (t) => !selectedAccountTypes.includes(t.name),
    );

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await apiRequest('PATCH', `/api/users/${user.id}`, {
                subscriptionTier: selectedTier,
                accountTypes: selectedAccountTypes,
                relationshipManagerId: selectedRmId,
            });
            await apiRequest('PUT', `/api/users/${user.id}/company-memberships`, {
                companyIds: selectedCompanies.map((c) => c.id),
            });
            queryClient.invalidateQueries({
                // The user-list query key varies with the admin filters, so match any variant.
                predicate: (query) =>
                    typeof query.queryKey[0] === 'string' &&
                    query.queryKey[0].startsWith('/api/users/?'),
            });
            queryClient.invalidateQueries({
                queryKey: [`/api/users/${user.id}/company-memberships`],
            });
            toast({ title: 'User updated', description: 'Changes have been saved.' });
            onSuccess?.();
            onClose();
        } catch (error: unknown) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to update user',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">User</label>
                    <Input
                        value={`${user.firstName} ${user.lastName}`}
                        readOnly
                        className="bg-muted cursor-not-allowed"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Relationship Manager</label>
                    <Select
                        value={selectedRmId ?? NO_VALUE}
                        onValueChange={(v) => setSelectedRmId(v === NO_VALUE ? null : v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="No manager" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                            <SelectItem value={NO_VALUE}>No manager</SelectItem>
                            {relationshipManagers
                                .filter((rm) => rm.id !== user.id)
                                .map((rm) => (
                                    <SelectItem key={rm.id} value={rm.id}>
                                        {rm.firstName} {rm.lastName}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Account Tier</label>
                    <Select
                        value={selectedTier ?? NO_VALUE}
                        onValueChange={(v) => setSelectedTier(v === NO_VALUE ? null : v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="No tier" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                            <SelectItem value={NO_VALUE}>No tier</SelectItem>
                            {SUBSCRIPTION_TIERS.map((tier) => (
                                <SelectItem key={tier} value={tier}>
                                    {tier}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Account Types</label>
                    <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                        {selectedAccountTypes.map((typeName) => (
                            <Badge
                                key={typeName}
                                variant="secondary"
                                className="font-normal"
                                onRemove={() =>
                                    setSelectedAccountTypes((prev) =>
                                        prev.filter((t) => t !== typeName),
                                    )
                                }
                                removeLabel={`Remove ${typeName}`}
                            >
                                {typeName}
                            </Badge>
                        ))}
                        {availableAccountTypes.length > 0 && (
                            <Select
                                value=""
                                onValueChange={(v) => {
                                    if (v) setSelectedAccountTypes((prev) => [...prev, v]);
                                }}
                            >
                                <SelectTrigger className="h-7 w-[120px] border-dashed">
                                    <SelectValue placeholder="Add type" />
                                </SelectTrigger>
                                <SelectContent className="z-[10000]">
                                    {availableAccountTypes.map((t) => (
                                        <SelectItem key={t.id} value={t.name} hideIndicator>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {selectedAccountTypes.length === 0 &&
                            availableAccountTypes.length === 0 && (
                                <span className="text-sm text-muted-foreground">
                                    No account types available
                                </span>
                            )}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Companies</label>
                    {selectedCompanies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pb-1">
                            {selectedCompanies.map((c) => (
                                <Badge
                                    key={c.id}
                                    variant="secondary"
                                    className="font-normal"
                                    onRemove={() =>
                                        setSelectedCompanies((prev) =>
                                            prev.filter((co) => co.id !== c.id),
                                        )
                                    }
                                    removeLabel={`Remove ${c.companyName}`}
                                >
                                    {c.companyName}
                                </Badge>
                            ))}
                        </div>
                    )}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search companies..."
                            value={companySearch}
                            onChange={(e) => {
                                setCompanySearch(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => {
                                blurTimeoutRef.current = setTimeout(
                                    () => setShowSuggestions(false),
                                    150,
                                );
                            }}
                            className="pl-9 pr-9"
                        />
                        {companySearch && (
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => {
                                    setCompanySearch('');
                                    setShowSuggestions(false);
                                }}
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                        {showSuggestions && filteredSuggestions.length > 0 && (
                            <div className="absolute z-[10000] w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                                {filteredSuggestions.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => addCompany(s)}
                                    >
                                        {s.companyName}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-2 pt-4">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="flex-1"
                    disabled={isLoading}
                >
                    Cancel
                </Button>
                <Button type="button" className="flex-1" onClick={handleSave} disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save'
                    )}
                </Button>
            </div>
        </>
    );
}
