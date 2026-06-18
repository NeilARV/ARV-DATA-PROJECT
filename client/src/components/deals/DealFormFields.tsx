import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { msaShortName } from '@/components/deals/DealsLocationSearch';

import type { DealFormValues } from '@database/inserts/deals.insert';

import { apiRequest } from '@/lib/queryClient';

export const PROPERTY_TYPES = [
    'Single Family',
    'Townhouse',
    'Condo',
    'Duplex',
    'Triplex',
    'Fourplex',
    'Vacant Land',
    'Other',
];

export const ADD_DEAL_TYPES = [
    { value: 'agent', label: 'Agent Deal' },
    { value: 'wholesale', label: 'Wholesale Deal' },
    { value: 'reo', label: 'REO Deal' },
];

export const EDIT_DEAL_TYPES = [
    { value: 'agent', label: 'Agent Deal' },
    { value: 'wholesale', label: 'Wholesale Deal' },
    { value: 'reo', label: 'REO Deal' },
    { value: 'sold', label: 'Sold Deal' },
];

export function FormSectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                {children}
            </span>
            <div className="flex-1 h-px bg-border" />
        </div>
    );
}

function maskDateInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const TIME_OPTIONS = Array.from({ length: 12 }, (_, h) =>
    [0, 15, 30, 45].map((m) => {
        const val = `${h + 1}:${String(m).padStart(2, '0')}`;
        return { value: val, label: val };
    }),
).flat();

function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

type DealFormFieldsProps = {
    form: UseFormReturn<DealFormValues>;
    dealTypes: { value: string; label: string }[];
    links: string[];
    onLinksChange: (links: string[]) => void;
    photosUrl: string;
    onPhotosUrlChange: (url: string) => void;
    // Reveals the manual market picker when the server could not derive an MSA from the address.
    showMsaFallback: boolean;
};

export default function DealFormFields({
    form,
    dealTypes,
    links,
    onLinksChange,
    photosUrl,
    onPhotosUrlChange,
    showMsaFallback,
}: DealFormFieldsProps) {
    const { control } = form;
    const linksEndRef = useRef<HTMLDivElement>(null);

    const addressUndisclosed = form.watch('addressUndisclosed');
    const disclosed = !addressUndisclosed;

    const { data: msaList = [] } = useQuery<{ id: number; name: string }[]>({
        queryKey: ['/api/deals/msas'],
        queryFn: () => apiRequest('GET', '/api/deals/msas').then((r) => r.json()),
        enabled: showMsaFallback,
        staleTime: 5 * 60 * 1000,
    });

    function handleAddLink() {
        onLinksChange([...links, '']);
        requestAnimationFrame(() => {
            linksEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    return (
        <div className="space-y-6">
            {/* ── Location ─────────────────────────────────────────────────────── */}
            <div className="space-y-4">
                <FormSectionLabel>Location</FormSectionLabel>

                {disclosed && (
                    <FormField
                        control={control}
                        name="address"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Street Address *</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        value={field.value ?? ''}
                                        placeholder="123 Main St"
                                    />
                                </FormControl>
                                <p className="text-xs text-muted-foreground">
                                    Beds, baths, square feet & property type are pulled from the
                                    address automatically.
                                </p>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormField
                    control={control}
                    name="addressUndisclosed"
                    render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={(checked) => {
                                        field.onChange(checked);
                                        if (checked) {
                                            form.setValue('address', '');
                                            form.clearErrors('address');
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">
                                Undisclosed address
                            </FormLabel>
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-3 gap-4">
                    <FormField
                        control={control}
                        name="city"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>City *</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="San Diego" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="state"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>State *</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="CA" maxLength={2} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="zipCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Zip Code *</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="92126" maxLength={5} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {showMsaFallback && (
                    <FormField
                        control={control}
                        name="msaId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Market (MSA) *</FormLabel>
                                <p className="text-xs text-muted-foreground">
                                    We couldn&apos;t determine the market for this address — please
                                    select it.
                                </p>
                                <Select
                                    value={field.value != null ? String(field.value) : ''}
                                    onValueChange={(v) => field.onChange(Number(v))}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select market" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="z-[10000]">
                                        {msaList.map((msa) => (
                                            <SelectItem key={msa.id} value={String(msa.id)}>
                                                {msaShortName(msa.name)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
            </div>

            {/* ── Property details — only for an undisclosed address (else SFR fills it) ── */}
            {addressUndisclosed && (
                <div className="space-y-4">
                    <FormSectionLabel>Property Details</FormSectionLabel>

                    <div className="grid grid-cols-3 gap-4">
                        <FormField
                            control={control}
                            name="beds"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Beds *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="number"
                                            min={0}
                                            placeholder="3"
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(e.target.value)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name="baths"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Baths *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="number"
                                            min={0}
                                            step={0.5}
                                            placeholder="2"
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(e.target.value)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name="sqft"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Sq Ft *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="number"
                                            min={1}
                                            placeholder="1500"
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(e.target.value)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={control}
                        name="propertyType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Property Type *</FormLabel>
                                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="z-[10000]">
                                        {PROPERTY_TYPES.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}

            {/* ── Deal terms ───────────────────────────────────────────────────── */}
            <div className="space-y-4">
                <FormSectionLabel>Deal Terms</FormSectionLabel>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={control}
                        name="dealType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Deal Type</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="z-[10000]">
                                        {dealTypes.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Price{' '}
                                    <span className="text-muted-foreground font-normal">
                                        (optional)
                                    </span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        type="number"
                                        min={1}
                                        placeholder="350000"
                                        value={field.value ?? ''}
                                        onChange={(e) => field.onChange(e.target.value)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={control}
                        name="potentialARV"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Potential ARV{' '}
                                    <span className="text-muted-foreground font-normal">
                                        (optional)
                                    </span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        type="number"
                                        min={1}
                                        placeholder="425000"
                                        value={field.value ?? ''}
                                        onChange={(e) => field.onChange(e.target.value)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="estimatedBudget"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Estimated Budget{' '}
                                    <span className="text-muted-foreground font-normal">
                                        (optional)
                                    </span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        type="number"
                                        min={1}
                                        step={1}
                                        placeholder="75000"
                                        value={field.value ?? ''}
                                        onChange={(e) => field.onChange(e.target.value)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={control}
                        name="showingDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Showing Date{' '}
                                    <span className="text-muted-foreground font-normal">
                                        (optional)
                                    </span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="MM/DD/YYYY"
                                        value={field.value ?? ''}
                                        onChange={(e) => field.onChange(maskDateInput(e.target.value))}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="showingTimeStr"
                        render={({ field: timeField }) => (
                            <FormItem>
                                <FormLabel>
                                    Showing Time{' '}
                                    <span className="text-muted-foreground font-normal">
                                        (optional)
                                    </span>
                                </FormLabel>
                                <div className="flex gap-2">
                                    <Select
                                        value={timeField.value ?? ''}
                                        onValueChange={timeField.onChange}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="flex-1">
                                                <SelectValue placeholder="Select time" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="z-[10000]">
                                            {TIME_OPTIONS.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormField
                                        control={control}
                                        name="showingAmPm"
                                        render={({ field: ampmField }) => (
                                            <Select
                                                value={ampmField.value}
                                                onValueChange={ampmField.onChange}
                                            >
                                                <SelectTrigger className="w-20 shrink-0">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[10000]">
                                                    <SelectItem value="AM">AM</SelectItem>
                                                    <SelectItem value="PM">PM</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            {/* ── Additional info ──────────────────────────────────────────────── */}
            <div className="space-y-4">
                <FormSectionLabel>Additional Info</FormSectionLabel>

                <FormField
                    control={control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Notes{' '}
                                <span className="text-muted-foreground font-normal">(optional)</span>
                            </FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    placeholder="Add any additional details about this deal..."
                                    className="resize-none"
                                    rows={3}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <FormLabel>
                            Comparable Sale Links{' '}
                            <span className="text-muted-foreground font-normal">
                                (optional, max 3)
                            </span>
                        </FormLabel>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs px-2"
                            onClick={handleAddLink}
                            disabled={links.length >= 3}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Link
                        </Button>
                    </div>
                    {links.map((link, i) => (
                        <div key={i} className="flex gap-2">
                            <Input
                                value={link}
                                onChange={(e) =>
                                    onLinksChange(
                                        links.map((l, idx) => (idx === i ? e.target.value : l)),
                                    )
                                }
                                placeholder="https://example.com"
                                className={
                                    link.length > 0 && !isValidUrl(link)
                                        ? 'border-destructive focus-visible:ring-destructive'
                                        : ''
                                }
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                                onClick={() => onLinksChange(links.filter((_, idx) => idx !== i))}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                    <div ref={linksEndRef} />
                </div>

                <div className="space-y-2">
                    <FormLabel>
                        Photo Album URL{' '}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <Input
                        value={photosUrl}
                        onChange={(e) => onPhotosUrlChange(e.target.value)}
                        placeholder="https://photos.example.com/album"
                        className={
                            photosUrl.length > 0 && !isValidUrl(photosUrl)
                                ? 'border-destructive focus-visible:ring-destructive'
                                : ''
                        }
                    />
                    {photosUrl.length > 0 && !isValidUrl(photosUrl) && (
                        <p className="text-xs text-destructive">Please enter a valid URL</p>
                    )}
                </div>
            </div>
        </div>
    );
}
