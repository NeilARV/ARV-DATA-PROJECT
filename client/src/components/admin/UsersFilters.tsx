import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, X, ChevronDown } from 'lucide-react';

import type {
    AccountTypeOption,
    CompanyFilter,
    EmailVerifiedFilter,
    TierFilter,
    UserFilters,
} from '@/types/admin';

type UsersFiltersProps = {
    filters: UserFilters;
    onChange: (patch: Partial<UserFilters>) => void;
    onClear: () => void;
    accountTypeOptions: AccountTypeOption[];
};

const TIER_OPTIONS: { value: TierFilter; label: string }[] = [
    { value: 'all', label: 'All tiers' },
    { value: 'basic', label: 'Basic' },
    { value: 'pro', label: 'Pro' },
    { value: 'premium', label: 'Premium' },
    { value: 'none', label: 'No tier' },
];

const VERIFIED_OPTIONS: { value: EmailVerifiedFilter; label: string }[] = [
    { value: 'all', label: 'Any email status' },
    { value: 'verified', label: 'Verified' },
    { value: 'unverified', label: 'Unverified' },
];

const COMPANY_OPTIONS: { value: CompanyFilter; label: string }[] = [
    { value: 'all', label: 'Any company status' },
    { value: 'has', label: 'Has company' },
    { value: 'none', label: 'No company' },
];

/**
 * Toolbar of search + filter controls for the admin Users tab. Fully controlled:
 * it renders the given filter state and reports every change up via `onChange`.
 */
export default function UsersFilters({
    filters,
    onChange,
    onClear,
    accountTypeOptions,
}: UsersFiltersProps) {
    const hasActiveFilters =
        filters.search !== '' ||
        filters.tier !== 'all' ||
        filters.accountTypes.length > 0 ||
        filters.emailVerified !== 'all' ||
        filters.company !== 'all';

    const accountTypesLabel =
        filters.accountTypes.length > 0
            ? `Account types (${filters.accountTypes.length})`
            : 'Account types';

    function handleToggleAccountType(name: string, checked: boolean) {
        const next = checked
            ? [...filters.accountTypes, name]
            : filters.accountTypes.filter((t) => t !== name);
        onChange({ accountTypes: next });
    }

    return (
        <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    placeholder="Search by name, email, or phone..."
                    value={filters.search}
                    onChange={(e) => onChange({ search: e.target.value })}
                    className="pl-9 pr-9"
                    data-testid="input-user-search"
                />
                {filters.search && (
                    <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => onChange({ search: '' })}
                        aria-label="Clear search"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            <Select
                value={filters.tier}
                onValueChange={(value) => onChange({ tier: value as TierFilter })}
            >
                <SelectTrigger className="w-[140px]" data-testid="select-tier-filter">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {TIER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        className="justify-between gap-2 min-w-[160px]"
                        data-testid="dropdown-account-types-filter"
                    >
                        <span className="truncate">{accountTypesLabel}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px]">
                    {accountTypeOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No account types
                        </div>
                    ) : (
                        accountTypeOptions.map((option) => (
                            <DropdownMenuCheckboxItem
                                key={option.id}
                                checked={filters.accountTypes.includes(option.name)}
                                onCheckedChange={(checked) =>
                                    handleToggleAccountType(option.name, checked)
                                }
                                onSelect={(e) => e.preventDefault()}
                                className="capitalize"
                            >
                                {option.name}
                            </DropdownMenuCheckboxItem>
                        ))
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Select
                value={filters.emailVerified}
                onValueChange={(value) => onChange({ emailVerified: value as EmailVerifiedFilter })}
            >
                <SelectTrigger className="w-[160px]" data-testid="select-verified-filter">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {VERIFIED_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={filters.company}
                onValueChange={(value) => onChange({ company: value as CompanyFilter })}
            >
                <SelectTrigger className="w-[170px]" data-testid="select-company-filter">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {COMPANY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Button
                variant="ghost"
                onClick={onClear}
                disabled={!hasActiveFilters}
                className="text-muted-foreground"
                data-testid="button-clear-filters"
            >
                <X className="h-4 w-4 mr-1.5" />
                Clear
            </Button>
        </div>
    );
}
