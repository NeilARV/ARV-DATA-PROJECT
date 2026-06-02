import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type Transaction = {
    id: number;
    propertyId: string;
    transactionType: string | null;
    recordingDate: string;
    saleDate: string;
    buyerId: string | null;
    buyerName: string | null;
    sellerId: string | null;
    sellerName: string | null;
    salePrice: string | null;
    firstMtgLenderName: string | null;
    isManualOverride: boolean;
};

type EditForm = {
    transactionType: string;
    recordingDate: string;
    saleDate: string;
    buyerName: string;
    sellerName: string;
    salePrice: string;
    firstMtgLenderName: string;
};

type CompanySuggestion = { id: string; companyName: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSACTION_TYPES = [
    'Arms Length',
    'Non-Arms Length',
    'Assignment',
    'Refinance',
    'HELOC',
    'New Construction',
    'Acquisition',
] as const;

const TYPE_COLORS: Record<string, string> = {
    'arms length': 'bg-[#22C55E]/15 text-[#16A34A] border-[#22C55E]/30',
    'non-arms length': 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30',
    assignment: 'bg-[#9333EA]/15 text-[#7E22CE] border-[#9333EA]/30',
    refinance: 'bg-[#3B82F6]/15 text-[#1D4ED8] border-[#3B82F6]/30',
    heloc: 'bg-[#06B6D4]/15 text-[#0E7490] border-[#06B6D4]/30',
    'new construction': 'bg-[#EF4444]/15 text-[#DC2626] border-[#EF4444]/30',
    acquisition: 'bg-[#69C9E1]/15 text-[#0891B2] border-[#69C9E1]/30',
};

function typeBadgeClass(type: string | null): string {
    const key = (type ?? '').trim().toLowerCase();
    return TYPE_COLORS[key] ?? 'bg-muted text-muted-foreground border-border';
}

function formatPrice(price: string | null): string {
    if (!price) return '—';
    const n = parseFloat(price);
    if (isNaN(n)) return '—';
    return `$${n.toLocaleString()}`;
}

function formatDate(d: string): string {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    if (!y || !m || !day) return d;
    return `${m}/${day}/${y}`;
}

function emptyForm(tx?: Transaction): EditForm {
    return {
        transactionType: tx?.transactionType ?? 'Arms Length',
        recordingDate: tx?.recordingDate ?? '',
        saleDate: tx?.saleDate ?? tx?.recordingDate ?? '',
        buyerName: tx?.buyerName ?? '',
        sellerName: tx?.sellerName ?? '',
        salePrice: tx?.salePrice ?? '',
        firstMtgLenderName: tx?.firstMtgLenderName ?? '',
    };
}

// ─── Company Autocomplete ─────────────────────────────────────────────────────

function CompanyAutocomplete({
    value,
    onChange,
    county,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    county?: string | null;
    placeholder?: string;
}) {
    const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value.length < 2) {
            setSuggestions([]);
            setOpen(false);
            return;
        }
        const t = setTimeout(async () => {
            try {
                const p = new URLSearchParams({ search: value });
                if (county) p.set('county', county);
                const r = await fetch(`/api/companies/contacts/suggestions?${p}`);
                if (!r.ok) return;
                const data: CompanySuggestion[] = await r.json();
                setSuggestions(data ?? []);
                setOpen(data.length > 0);
            } catch {}
        }, 300);
        return () => clearTimeout(t);
    }, [value, county]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                placeholder={placeholder}
                className="h-7 text-xs"
                autoComplete="off"
            />
            {open && (
                <ul className="absolute left-0 right-0 top-full mt-0.5 z-[10002] bg-popover border border-border rounded-md shadow-md overflow-hidden">
                    {suggestions.map((s) => (
                        <li
                            key={s.id}
                            className="px-2 py-1.5 text-xs cursor-pointer hover:bg-accent"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onChange(s.companyName);
                                setOpen(false);
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

// ─── Edit Row ─────────────────────────────────────────────────────────────────

function EditRow({
    form,
    onChange,
    onSave,
    onCancel,
    isSaving,
    county,
}: {
    form: EditForm;
    onChange: (patch: Partial<EditForm>) => void;
    onSave: () => void;
    onCancel: () => void;
    isSaving: boolean;
    county?: string | null;
}) {
    return (
        <div className="space-y-2 p-3 bg-muted/40 rounded-lg border border-border">
            {/* Type */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Type</span>
                <select
                    value={form.transactionType}
                    onChange={(e) => onChange({ transactionType: e.target.value })}
                    className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    {TRANSACTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </div>

            {/* Recording Date */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Rec. Date</span>
                <Input
                    type="date"
                    value={form.recordingDate}
                    onChange={(e) => onChange({ recordingDate: e.target.value })}
                    className="flex-1 h-7 text-xs"
                />
            </div>

            {/* Sale Date */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Sale Date</span>
                <Input
                    type="date"
                    value={form.saleDate}
                    onChange={(e) => onChange({ saleDate: e.target.value })}
                    className="flex-1 h-7 text-xs"
                />
            </div>

            {/* Buyer */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Buyer</span>
                <div className="flex-1">
                    <CompanyAutocomplete
                        value={form.buyerName}
                        onChange={(v) => onChange({ buyerName: v })}
                        county={county}
                        placeholder="Buyer company name"
                    />
                </div>
            </div>

            {/* Seller */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Seller</span>
                <div className="flex-1">
                    <CompanyAutocomplete
                        value={form.sellerName}
                        onChange={(v) => onChange({ sellerName: v })}
                        county={county}
                        placeholder="Seller name"
                    />
                </div>
            </div>

            {/* Sale Price */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Price</span>
                <Input
                    value={form.salePrice}
                    onChange={(e) => onChange({ salePrice: e.target.value })}
                    placeholder="e.g. 450000"
                    className="flex-1 h-7 text-xs"
                />
            </div>

            {/* Lender */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Lender</span>
                <Input
                    value={form.firstMtgLenderName}
                    onChange={(e) => onChange({ firstMtgLenderName: e.target.value })}
                    placeholder="First mortgage lender"
                    className="flex-1 h-7 text-xs"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="flex-1 h-7 text-xs"
                >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                </Button>
                <Button
                    size="sm"
                    onClick={onSave}
                    disabled={isSaving || !form.recordingDate || !form.saleDate}
                    className="flex-1 h-7 text-xs"
                >
                    {isSaving ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                        <Check className="w-3 h-3 mr-1" />
                    )}
                    Save
                </Button>
            </div>
        </div>
    );
}

// ─── Display Row ──────────────────────────────────────────────────────────────

function DisplayRow({
    tx,
    onEdit,
    onDelete,
    isDeleting,
    isAdminOrOwner,
}: {
    tx: Transaction;
    onEdit: () => void;
    onDelete: () => void;
    isDeleting: boolean;
    isAdminOrOwner: boolean;
}) {
    return (
        <div className="p-3 rounded-lg border border-border bg-card space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${typeBadgeClass(tx.transactionType)}`}
                    >
                        {tx.transactionType ?? 'Unknown'}
                    </span>
                    {tx.isManualOverride && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                            Manual
                        </span>
                    )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDate(tx.recordingDate)}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div>
                    <p className="text-[10px] text-muted-foreground">Buyer</p>
                    <p className="text-xs font-medium text-foreground truncate">
                        {tx.buyerName ?? '—'}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-muted-foreground">Seller</p>
                    <p className="text-xs font-medium text-foreground truncate">
                        {tx.sellerName ?? '—'}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{formatPrice(tx.salePrice)}</span>
                {tx.firstMtgLenderName && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                        {tx.firstMtgLenderName}
                    </span>
                )}
            </div>

            {isAdminOrOwner && (
                <div className="flex gap-1.5 pt-0.5">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onEdit}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onDelete}
                        disabled={isDeleting}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    >
                        {isDeleting ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                            <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Delete
                    </Button>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface PropertyTransactionsProps {
    propertyId: string;
    county?: string | null;
    onReprocess?: () => void;
}

export function PropertyTransactions({
    propertyId,
    county,
    onReprocess,
}: PropertyTransactionsProps) {
    const { toast } = useToast();
    const { isAdmin, isOwner } = useAuth();
    const isAdminOrOwner = isAdmin || isOwner;

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Which row is in edit mode (by id), or null
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<EditForm>(emptyForm());
    const [isSaving, setIsSaving] = useState(false);

    // Adding new row
    const [isAdding, setIsAdding] = useState(false);
    const [addForm, setAddForm] = useState<EditForm>(emptyForm());

    // Deleting
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const fetchTransactions = useCallback(async () => {
        try {
            setError(null);
            const resp = await fetch(`/api/properties/${propertyId}/transactions`);
            if (!resp.ok) throw new Error('Failed to load transactions');
            const data: Transaction[] = await resp.json();
            setTransactions(data);
        } catch {
            setError('Could not load transactions');
        } finally {
            setIsLoading(false);
        }
    }, [propertyId]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    function startEdit(tx: Transaction) {
        setEditingId(tx.id);
        setEditForm(emptyForm(tx));
        setIsAdding(false);
    }

    function cancelEdit() {
        setEditingId(null);
    }

    function startAdd() {
        setIsAdding(true);
        setAddForm(emptyForm());
        setEditingId(null);
    }

    function cancelAdd() {
        setIsAdding(false);
    }

    async function handleSaveEdit() {
        if (!editingId) return;
        setIsSaving(true);
        try {
            await apiRequest('PATCH', `/api/properties/${propertyId}/transactions/${editingId}`, {
                transactionType: editForm.transactionType || undefined,
                recordingDate: editForm.recordingDate || undefined,
                saleDate: editForm.saleDate || undefined,
                buyerName: editForm.buyerName || null,
                sellerName: editForm.sellerName || null,
                salePrice: editForm.salePrice || null,
                firstMtgLenderName: editForm.firstMtgLenderName || null,
            });
            setEditingId(null);
            await fetchTransactions();
            invalidatePropertyQueries();
            onReprocess?.();
            toast({ title: 'Transaction updated' });
        } catch (e) {
            toast({
                title: 'Error',
                description: e instanceof Error ? e.message : 'Failed to update',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleSaveAdd() {
        if (!addForm.recordingDate || !addForm.saleDate) return;
        setIsSaving(true);
        try {
            await apiRequest('POST', `/api/properties/${propertyId}/transactions`, {
                transactionType: addForm.transactionType,
                recordingDate: addForm.recordingDate,
                saleDate: addForm.saleDate,
                buyerName: addForm.buyerName || undefined,
                sellerName: addForm.sellerName || undefined,
                salePrice: addForm.salePrice || undefined,
                firstMtgLenderName: addForm.firstMtgLenderName || undefined,
            });
            setIsAdding(false);
            await fetchTransactions();
            invalidatePropertyQueries();
            onReprocess?.();
            toast({ title: 'Transaction added' });
        } catch (e) {
            toast({
                title: 'Error',
                description: e instanceof Error ? e.message : 'Failed to add',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(txId: number) {
        setDeletingId(txId);
        try {
            await apiRequest('DELETE', `/api/properties/${propertyId}/transactions/${txId}`);
            await fetchTransactions();
            invalidatePropertyQueries();
            onReprocess?.();
            toast({ title: 'Transaction deleted' });
        } catch (e) {
            toast({
                title: 'Error',
                description: e instanceof Error ? e.message : 'Failed to delete',
                variant: 'destructive',
            });
        } finally {
            setDeletingId(null);
        }
    }

    function invalidatePropertyQueries() {
        queryClient.invalidateQueries({
            predicate: (q) => {
                const key = q.queryKey[0];
                return typeof key === 'string' && key.startsWith('/api/properties');
            },
        });
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Transactions</h3>
                {isAdminOrOwner && !isAdding && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={startAdd}
                        className="h-7 px-2 text-xs"
                    >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                    </Button>
                )}
            </div>

            {isAdding && (
                <EditRow
                    form={addForm}
                    onChange={(patch) => setAddForm((f) => ({ ...f, ...patch }))}
                    onSave={handleSaveAdd}
                    onCancel={cancelAdd}
                    isSaving={isSaving}
                    county={county}
                />
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-xs text-destructive py-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {error}
                </div>
            )}

            {!isLoading && !error && transactions.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No transactions recorded.</p>
            )}

            <div className="space-y-2">
                {transactions.map((tx) =>
                    editingId === tx.id ? (
                        <EditRow
                            key={tx.id}
                            form={editForm}
                            onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
                            onSave={handleSaveEdit}
                            onCancel={cancelEdit}
                            isSaving={isSaving}
                            county={county}
                        />
                    ) : (
                        <DisplayRow
                            key={tx.id}
                            tx={tx}
                            onEdit={() => startEdit(tx)}
                            onDelete={() => handleDelete(tx.id)}
                            isDeleting={deletingId === tx.id}
                            isAdminOrOwner={isAdminOrOwner}
                        />
                    ),
                )}
            </div>
        </div>
    );
}
