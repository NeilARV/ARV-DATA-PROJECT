import { useState, useEffect, useRef } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormControl,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { Loader2, Check, X, Trash2, Tag, Pencil } from 'lucide-react';
import { cn } from '@/utils/merge';

// ─── Property form ─────────────────────────────────────────────────────────

const PROPERTY_STATUSES = ['in-renovation', 'wholesale', 'on-market', 'sold'] as const;
type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string }> = {
    'in-renovation': { label: 'Renovating', color: '#69C9E1' },
    wholesale: { label: 'Wholesale', color: '#9333EA' },
    'on-market': { label: 'On Market', color: '#22C55E' },
    sold: { label: 'Sold', color: '#FF0000' },
};

const updatePropertyFormSchema = z.object({
    isArvFunded: z.boolean(),
    statuses: z.array(z.enum(PROPERTY_STATUSES)).min(1, 'At least one status is required'),
});

type UpdatePropertyFormValues = z.infer<typeof updatePropertyFormSchema>;

export type UpdatePropertyContentProps = {
    onClose: () => void;
    propertyId: string;
    initialData: {
        isArvFunded: boolean;
        statuses: string[];
        county?: string | null;
    };
    onSuccess?: () => void;
};

// ─── Transaction rows ──────────────────────────────────────────────────────

// Transaction-type badge palette — the sanctioned categorical hexes from the design system
// (see .claude/docs/design-guidelines.md → "Transaction Type Colors"): translucent fill,
// saturated border, darker same-hue text. Keyed by lower(trimmed) type; unmapped types fall
// back to muted tokens.
const TX_TYPE_COLORS: Record<string, string> = {
    'arms length': 'bg-[#22C55E]/15 text-[#16A34A] border-[#22C55E]/30',
    'non-arms length': 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30',
    assignment: 'bg-[#9333EA]/15 text-[#7E22CE] border-[#9333EA]/30',
    refinance: 'bg-[#3B82F6]/15 text-[#1D4ED8] border-[#3B82F6]/30',
    'refi loans': 'bg-[#3B82F6]/15 text-[#1D4ED8] border-[#3B82F6]/30',
    heloc: 'bg-[#06B6D4]/15 text-[#0E7490] border-[#06B6D4]/30',
    helocs: 'bg-[#06B6D4]/15 text-[#0E7490] border-[#06B6D4]/30',
    '2nd trust deeds': 'bg-[#6366F1]/15 text-[#4F46E5] border-[#6366F1]/30',
    'new construction': 'bg-[#EF4444]/15 text-[#DC2626] border-[#EF4444]/30',
    acquisition: 'bg-[#69C9E1]/15 text-[#0891B2] border-[#69C9E1]/30',
};

const TYPE_BADGE_FALLBACK = 'bg-muted text-muted-foreground border-border';

function typeBadgeClass(type: string): string {
    return TX_TYPE_COLORS[type.trim().toLowerCase()] ?? TYPE_BADGE_FALLBACK;
}

/** "2024-01-05" → "Jan 5, 2024". Returns "—" for empty, echoes non-ISO input unchanged. */
function formatTxDate(d: string): string {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    if (!y || !m || !day) return d;
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    return `${months[Number(m) - 1] ?? m} ${Number(day)}, ${y}`;
}

function formatTxPrice(price: string): string {
    if (!price) return '—';
    const n = Number(price);
    return isNaN(n) ? '—' : `$${n.toLocaleString()}`;
}

/** Colored transaction-type / assignment pill. `type` selects the palette; `label` is shown. */
function TxBadge({ label, type }: { label: string; type: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold',
                typeBadgeClass(type),
            )}
        >
            {label}
        </span>
    );
}

type TxRow = {
    _key: string;
    id: number | null;
    sortOrder: number | null;
    userCreated: boolean;
    transactionType: string;
    recordingDate: string;
    saleDate: string;
    buyerName: string;
    sellerName: string;
    salePrice: string;
    firstMtgLenderName: string;
    isAssignment: boolean;
    assignorName: string;
    // Original assignment state as fetched — Save only sends rows that changed.
    origIsAssignment: boolean;
    origAssignorName: string;
};

// ─── Company autocomplete ──────────────────────────────────────────────────

type CompanySuggestion = { id: string; companyName: string };

function CompanyAutocomplete({
    value,
    onChange,
    county,
    placeholder,
}: {
    value: string;
    onChange: (val: string) => void;
    county?: string | null;
    placeholder: string;
}) {
    const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const justSelected = useRef(false);

    useEffect(() => {
        if (value.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        if (justSelected.current) {
            justSelected.current = false;
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ search: value });
                if (county) params.set('county', county);
                const resp = await fetch(`/api/companies/contacts/suggestions?${params}`);
                if (!resp.ok) return;
                const data: CompanySuggestion[] = await resp.json();
                setSuggestions(data ?? []);
                setShowSuggestions(data.length > 0);
            } catch {}
        }, 300);
        return () => clearTimeout(timer);
    }, [value, county]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative">
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={placeholder}
                autoComplete="off"
                className="h-8 text-sm"
            />
            {showSuggestions && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-[10002] bg-popover border border-border rounded-md shadow-md overflow-hidden">
                    {suggestions.map((s) => (
                        <li
                            key={s.id}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                justSelected.current = true;
                                setSuggestions([]);
                                onChange(s.companyName);
                                setShowSuggestions(false);
                            }}
                        >
                            {s.companyName}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ─── Assignor inline editor ────────────────────────────────────────────────

/** Inline editor for marking a sale transaction as an assignment (naming the assignor). */
function TxAssignRow({
    value,
    onChange,
    onApply,
    onCancel,
    county,
}: {
    value: string;
    onChange: (val: string) => void;
    onApply: () => void;
    onCancel: () => void;
    county?: string | null;
}) {
    return (
        <div className="rounded-xl border border-[#9333EA]/30 bg-[#9333EA]/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#7E22CE]" />
                <span className="text-sm font-semibold text-foreground">Mark as assignment</span>
            </div>
            <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted-foreground">
                    Assignor{' '}
                    <span className="font-normal text-muted-foreground/70">
                        — the wholesaler who assigned the contract
                    </span>
                </label>
                <CompanyAutocomplete
                    value={value}
                    onChange={onChange}
                    county={county}
                    placeholder="Assignor company or individual"
                />
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onCancel}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button type="button" size="sm" onClick={onApply} disabled={!value.trim()}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Apply
                </Button>
            </div>
        </div>
    );
}

// ─── Transaction display card ──────────────────────────────────────────────

/** Assignments live only on Arms Length sales — see markTransactionAssignments (server). */
function isArmsLength(type: string): boolean {
    return type.trim().toLowerCase() === 'arms length';
}

/** Compact label-over-value cell used in a transaction card's field grid. */
function Field({
    label,
    value,
    className,
}: {
    label: string;
    value: string;
    className?: string;
}) {
    return (
        <div className={cn('min-w-0', className)}>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="text-sm text-foreground break-words">{value}</div>
        </div>
    );
}

function TxDisplayCard({
    tx,
    onDelete,
    onStartAssign,
    onClearAssign,
    disabled = false,
}: {
    tx: TxRow;
    onDelete?: () => void;
    onStartAssign: () => void;
    onClearAssign: () => void;
    // True while another row's assignor editor is open — freezes this card's actions so an
    // in-progress edit can't be silently discarded by clicking a sibling row.
    disabled?: boolean;
}) {
    // Company names are stored ALL-CAPS; format before rendering (ARV.RAW-COMPANY-NAME).
    const buyer = formatCompanyName(tx.buyerName) ?? '—';
    const seller = formatCompanyName(tx.sellerName) ?? '—';
    const showAssignmentRow = tx.id != null && (isArmsLength(tx.transactionType) || tx.isAssignment);

    return (
        <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
            {/* Header: type + assignment badges, sort order, delete */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <TxBadge label={tx.transactionType || 'Unknown'} type={tx.transactionType} />
                    {tx.isAssignment && <TxBadge label="Assignment" type="assignment" />}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {tx.sortOrder != null && (
                        <span className="text-xs font-mono text-muted-foreground">
                            #{tx.sortOrder}
                        </span>
                    )}
                    {tx.userCreated && onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={disabled}
                            className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Delete transaction"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Dates + price */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                <Field label="Recording Date" value={formatTxDate(tx.recordingDate)} />
                <Field label="Sale Date" value={formatTxDate(tx.saleDate)} />
                <Field label="Sale Price" value={formatTxPrice(tx.salePrice)} />
            </div>

            {/* Parties */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Buyer" value={buyer} />
                <Field label="Seller" value={seller} />
                {tx.firstMtgLenderName && (
                    <Field label="Lender" value={tx.firstMtgLenderName} className="col-span-2" />
                )}
            </div>

            {/* Assignment — only on Arms Length sales (or an existing mark, so it can still be
                edited/removed). Non-sale rows can't be assignments. */}
            {showAssignmentRow &&
                (tx.isAssignment ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#9333EA]/20 bg-[#9333EA]/10 px-3 py-2">
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#7E22CE]">Assignor</div>
                            <div className="truncate text-sm font-medium text-foreground">
                                {tx.assignorName ? formatCompanyName(tx.assignorName) : '—'}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={onStartAssign}
                                disabled={disabled}
                                className="h-7 px-2 text-xs"
                            >
                                <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={onClearAssign}
                                disabled={disabled}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            >
                                <Trash2 className="w-3 h-3 mr-1" /> Remove
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        onClick={onStartAssign}
                        disabled={disabled}
                        className="h-8 gap-1.5 text-xs"
                    >
                        <Tag className="w-3.5 h-3.5" /> Mark as assignment
                    </Button>
                ))}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────

export function UpdatePropertyDialog({
    onClose,
    propertyId,
    initialData,
    onSuccess,
}: UpdatePropertyContentProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [transactions, setTransactions] = useState<TxRow[]>([]);
    const [txLoading, setTxLoading] = useState(true);
    const [assigningKey, setAssigningKey] = useState<string | null>(null);
    const [assignInput, setAssignInput] = useState('');
    const [deletedTxIds, setDeletedTxIds] = useState<number[]>([]);

    useEffect(() => {
        fetch(`/api/properties/${propertyId}/transactions`)
            .then((r) => r.json())
            .then(
                (
                    data: Array<{
                        id: number;
                        sortOrder: number | null;
                        userCreated: boolean;
                        transactionType: string | null;
                        recordingDate: string;
                        saleDate: string;
                        buyerName: string | null;
                        sellerName: string | null;
                        salePrice: string | null;
                        firstMtgLenderName: string | null;
                        isAssignment: boolean;
                        assignorName: string | null;
                    }>,
                ) => {
                    setTransactions(
                        data.map((tx) => ({
                            _key: String(tx.id),
                            id: tx.id,
                            sortOrder: tx.sortOrder,
                            userCreated: tx.userCreated,
                            transactionType: tx.transactionType ?? '',
                            recordingDate: tx.recordingDate ?? '',
                            saleDate: tx.saleDate ?? '',
                            buyerName: tx.buyerName ?? '',
                            sellerName: tx.sellerName ?? '',
                            salePrice: tx.salePrice ?? '',
                            firstMtgLenderName: tx.firstMtgLenderName ?? '',
                            isAssignment: tx.isAssignment ?? false,
                            assignorName: tx.assignorName ?? '',
                            origIsAssignment: tx.isAssignment ?? false,
                            origAssignorName: tx.assignorName ?? '',
                        })),
                    );
                },
            )
            .catch(() => {})
            .finally(() => setTxLoading(false));
    }, [propertyId]);

    function startAssign(tx: TxRow) {
        setAssigningKey(tx._key);
        setAssignInput(tx.assignorName);
    }

    function applyAssign() {
        const name = assignInput.trim();
        setTransactions((prev) =>
            prev.map((tx) =>
                tx._key === assigningKey ? { ...tx, isAssignment: true, assignorName: name } : tx,
            ),
        );
        setAssigningKey(null);
        setAssignInput('');
    }

    function cancelAssign() {
        setAssigningKey(null);
        setAssignInput('');
    }

    function clearAssign(tx: TxRow) {
        setTransactions((prev) =>
            prev.map((t) =>
                t._key === tx._key ? { ...t, isAssignment: false, assignorName: '' } : t,
            ),
        );
    }

    function handleDeleteTx(tx: TxRow) {
        setTransactions((prev) => prev.filter((t) => t._key !== tx._key));
        const id = tx.id;
        if (id != null) setDeletedTxIds((prev) => [...prev, id]);
    }

    const safeStatuses = initialData.statuses.filter((s): s is PropertyStatus =>
        (PROPERTY_STATUSES as readonly string[]).includes(s),
    );

    const form = useForm<UpdatePropertyFormValues>({
        resolver: zodResolver(updatePropertyFormSchema),
        defaultValues: {
            isArvFunded: initialData.isArvFunded,
            statuses: safeStatuses.length > 0 ? safeStatuses : ['in-renovation'],
        },
    });

    const handleSubmit = async (data: UpdatePropertyFormValues) => {
        setIsLoading(true);
        try {
            // Only send assignment rows whose flag or assignor changed. Compare trimmed names
            // and only diff the name when the row is actually an assignment, so a no-op edit
            // (or a stored name that isn't in canonical trimmed form) isn't re-sent.
            const assignmentChanges = transactions.flatMap((tx) => {
                if (tx.id == null) return [];
                const changed =
                    tx.isAssignment !== tx.origIsAssignment ||
                    (tx.isAssignment && tx.assignorName.trim() !== tx.origAssignorName.trim());
                if (!changed) return [];
                return [
                    {
                        transactionId: tx.id,
                        isAssignment: tx.isAssignment,
                        assignorName: tx.isAssignment ? tx.assignorName || null : null,
                    },
                ];
            });
            await apiRequest('PATCH', `/api/properties/${propertyId}`, {
                isArvFunded: data.isArvFunded,
                statuses: data.statuses,
                ...(assignmentChanges.length > 0 && { assignments: assignmentChanges }),
                ...(deletedTxIds.length > 0 && { deletedTransactionIds: deletedTxIds }),
            });
            toast({
                title: 'Property Updated',
                description: 'Property has been successfully updated.',
            });
            queryClient.invalidateQueries({
                predicate: (query) => {
                    const key = query.queryKey[0];
                    return typeof key === 'string' && key.startsWith('/api/properties');
                },
            });
            onSuccess?.();
            onClose();
        } catch (error: unknown) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to update property',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Edit Property</DialogTitle>
                <p className="text-sm text-muted-foreground">
                    Update funding, listing status, and transaction assignments.
                </p>
            </DialogHeader>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 pt-2">
                    {/* ARV Funded */}
                    <FormField
                        control={form.control}
                        name="isArvFunded"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>ARV Funded</FormLabel>
                                <Select
                                    value={field.value ? 'true' : 'false'}
                                    onValueChange={(val) => field.onChange(val === 'true')}
                                >
                                    <FormControl>
                                        <SelectTrigger data-testid="select-arv-funded">
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="z-[10002]">
                                        <SelectItem value="true">Yes</SelectItem>
                                        <SelectItem value="false">No</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Status toggle strip */}
                    <Controller
                        control={form.control}
                        name="statuses"
                        render={({ field, fieldState }) => (
                            <div className="space-y-2">
                                <span className="text-sm font-medium leading-none">Status</span>
                                <div className="inline-flex rounded-md border border-border overflow-hidden w-full">
                                    {PROPERTY_STATUSES.map((status, i) => {
                                        const active = field.value.includes(status);
                                        const isLast = i === PROPERTY_STATUSES.length - 1;
                                        return (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => {
                                                    if (active) {
                                                        if (field.value.length <= 1) return;
                                                        field.onChange(
                                                            field.value.filter((s) => s !== status),
                                                        );
                                                    } else {
                                                        field.onChange([...field.value, status]);
                                                    }
                                                }}
                                                className={`flex-1 h-9 flex items-center justify-center text-xs font-medium transition-colors whitespace-nowrap${isLast ? '' : ' border-r border-border'} ${
                                                    active
                                                        ? 'text-white'
                                                        : 'bg-background text-muted-foreground hover:bg-muted'
                                                }`}
                                                style={
                                                    active
                                                        ? {
                                                              backgroundColor:
                                                                  STATUS_CONFIG[status].color,
                                                          }
                                                        : undefined
                                                }
                                                data-testid={`button-status-${status}`}
                                            >
                                                {STATUS_CONFIG[status].label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {fieldState.error && (
                                    <p className="text-sm text-destructive">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </div>
                        )}
                    />

                    {/* Transactions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold leading-none">
                                Transactions
                            </label>
                            {!txLoading && transactions.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    {transactions.length} recorded
                                </span>
                            )}
                        </div>

                        {txLoading ? (
                            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                                No transactions recorded.
                            </div>
                        ) : (
                            <div
                                className="max-h-[26rem] space-y-3 overflow-y-auto pr-1"
                                onWheel={(e) => e.stopPropagation()}
                            >
                                {transactions.map((tx) => (
                                    <div key={tx._key}>
                                        {assigningKey === tx._key ? (
                                            <TxAssignRow
                                                value={assignInput}
                                                onChange={setAssignInput}
                                                onApply={applyAssign}
                                                onCancel={cancelAssign}
                                                county={initialData.county}
                                            />
                                        ) : (
                                            <TxDisplayCard
                                                tx={tx}
                                                onDelete={() => handleDeleteTx(tx)}
                                                onStartAssign={() => startAssign(tx)}
                                                onClearAssign={() => clearAssign(tx)}
                                                disabled={assigningKey !== null}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={isLoading}
                            data-testid="button-cancel-update-property"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={isLoading || !!assigningKey}
                            data-testid="button-save-update-property"
                        >
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
                </form>
            </Form>
        </>
    );
}
