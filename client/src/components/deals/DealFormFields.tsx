import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Control } from "react-hook-form";
import type { DealFormValues } from "@database/inserts/deals.insert";

export const PROPERTY_TYPES = [
    "Single Family",
    "Townhouse",
    "Condo",
    "Duplex",
    "Triplex",
    "Fourplex",
    "Vacant Land",
    "Other",
];

export const ADD_DEAL_TYPES = [
    { value: "agent",     label: "Agent Deal" },
    { value: "wholesale", label: "Wholesale Deal" },
];

export const EDIT_DEAL_TYPES = [
    { value: "agent",     label: "Agent Deal" },
    { value: "wholesale", label: "Wholesale Deal" },
    { value: "sold",      label: "Sold Deal" },
];

function isValidUrl(url: string): boolean {
    try { new URL(url); return true; } catch { return false; }
}

type DealFormFieldsProps = {
    control: Control<DealFormValues>;
    dealTypes: { value: string; label: string }[];
    hasFullAddress: boolean;
    links: string[];
    onLinksChange: (links: string[]) => void;
};

export default function DealFormFields({
    control,
    dealTypes,
    hasFullAddress,
    links,
    onLinksChange,
}: DealFormFieldsProps) {
    return (
        <div className="overflow-y-auto max-h-[50dvh] space-y-4 pl-1 pr-5 pb-1">

            <FormField
                control={control}
                name="address"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Street Address <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                            <Input {...field} placeholder="123 Main St" />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <div className="grid grid-cols-2 gap-4">
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
            </div>

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

            <FormField
                control={control}
                name="price"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Price <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                type="number"
                                min={1}
                                placeholder="350000"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="potentialARV"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Potential ARV <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                type="number"
                                min={1}
                                placeholder="425000"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="closeOfEscrow"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Close of Escrow <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                type="number"
                                min={1}
                                placeholder="500000"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

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
                                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {!hasFullAddress && (
                <>
                    <p className="text-xs text-muted-foreground">
                        Property details are required when a full street address (including house number) is not provided.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
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
                                            value={field.value ?? ""}
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
                                            value={field.value ?? ""}
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
                        name="sqft"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Square Feet *</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        type="number"
                                        min={1}
                                        placeholder="1500"
                                        value={field.value ?? ""}
                                        onChange={(e) => field.onChange(e.target.value)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={control}
                        name="propertyType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Property Type *</FormLabel>
                                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="z-[10000]">
                                        {PROPERTY_TYPES.map((t) => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </>
            )}

            {hasFullAddress && (
                <p className="text-xs text-muted-foreground">
                    Property details will be fetched automatically from the full street address.
                </p>
            )}

            <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
                    <label className="text-sm font-medium leading-none">
                        Comparable Sale Links <span className="text-muted-foreground font-normal">(optional, max 3)</span>
                    </label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs px-2"
                        onClick={() => onLinksChange([...links, ""])}
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
                            onChange={(e) => onLinksChange(links.map((l, idx) => idx === i ? e.target.value : l))}
                            placeholder="https://example.com"
                            className={link.length > 0 && !isValidUrl(link) ? "border-destructive focus-visible:ring-destructive" : ""}
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
            </div>

        </div>
    );
}
