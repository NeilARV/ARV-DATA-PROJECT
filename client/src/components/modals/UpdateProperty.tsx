import { useState, useEffect, useRef } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Check, X } from "lucide-react";

// ─── Property form ─────────────────────────────────────────────────────────

const PROPERTY_STATUSES = ["in-renovation", "wholesale", "on-market", "sold"] as const;
type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string }> = {
  "in-renovation": { label: "Renovating", color: "#69C9E1" },
  "wholesale":     { label: "Wholesale",  color: "#9333EA" },
  "on-market":     { label: "On Market",  color: "#22C55E" },
  "sold":          { label: "Sold",       color: "#FF0000" },
};

const updatePropertyFormSchema = z.object({
  isArvFunded: z.boolean(),
  statuses: z.array(z.enum(PROPERTY_STATUSES)).min(1, "At least one status is required"),
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

// ─── Transaction types ─────────────────────────────────────────────────────

const TRANSACTION_TYPES = [
  "Arms Length",
  "Non-Arms Length",
  "Assignment",
  "REFI LOANS",
  "2ND TRUST DEEDS",
  "HELOCS",
  "New Construction",
] as const;

const TX_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "Arms Length":      { bg: "#3B82F6", text: "#fff" },
  "Non-Arms Length":  { bg: "#F59E0B", text: "#fff" },
  "Assignment":       { bg: "#9333EA", text: "#fff" },
  "REFI LOANS":       { bg: "#F97316", text: "#fff" },
  "2ND TRUST DEEDS":  { bg: "#6366F1", text: "#fff" },
  "HELOCS":           { bg: "#EC4899", text: "#fff" },
  "New Construction": { bg: "#22C55E", text: "#fff" },
};

type TxRow = {
  _key: string;
  transactionType: string;
  recordingDate: string;
  saleDate: string;
  buyerName: string;
  sellerName: string;
  salePrice: string;
  firstMtgLenderName: string;
};

type TxEditForm = Omit<TxRow, "_key">;

function emptyEditForm(): TxEditForm {
  return {
    transactionType: "",
    recordingDate: "",
    saleDate: "",
    buyerName: "",
    sellerName: "",
    salePrice: "",
    firstMtgLenderName: "",
  };
}

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

  useEffect(() => {
    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: value });
        if (county) params.set("county", county);
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

// ─── Transaction inline edit row ───────────────────────────────────────────

function TxEditRow({
  form,
  onChange,
  onApply,
  onCancel,
  county,
}: {
  form: TxEditForm;
  onChange: (field: keyof TxEditForm, val: string) => void;
  onApply: () => void;
  onCancel: () => void;
  county?: string | null;
}) {
  const missingRequired = !form.recordingDate || !form.saleDate;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Type</label>
          <Select value={form.transactionType} onValueChange={(v) => onChange("transactionType", v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className="z-[10003]">
              {TRANSACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Recording Date <span className="text-destructive">*</span>
          </label>
          <Input
            type="date"
            value={form.recordingDate}
            onChange={(e) => onChange("recordingDate", e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Sale Date <span className="text-destructive">*</span>
          </label>
          <Input
            type="date"
            value={form.saleDate}
            onChange={(e) => onChange("saleDate", e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Buyer</label>
          <CompanyAutocomplete
            value={form.buyerName}
            onChange={(v) => onChange("buyerName", v)}
            county={county}
            placeholder="Buyer name"
          />
        </div>

        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Seller</label>
          <CompanyAutocomplete
            value={form.sellerName}
            onChange={(v) => onChange("sellerName", v)}
            county={county}
            placeholder="Seller name"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Sale Price</label>
          <Input
            value={form.salePrice}
            onChange={(e) => onChange("salePrice", e.target.value)}
            placeholder="e.g. 450000"
            className="h-8 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Lender</label>
          <Input
            value={form.firstMtgLenderName}
            onChange={(e) => onChange("firstMtgLenderName", e.target.value)}
            placeholder="Lender name"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="flex-1">
          <X className="w-3 h-3 mr-1" /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={onApply} disabled={missingRequired} className="flex-1">
          <Check className="w-3 h-3 mr-1" /> Apply
        </Button>
      </div>
    </div>
  );
}

// ─── Transaction display card ──────────────────────────────────────────────

function TxDisplayCard({ tx }: { tx: TxRow }) {
  const typeStyle = tx.transactionType ? TX_TYPE_COLORS[tx.transactionType] : null;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {typeStyle ? (
          <span
            className="text-xs font-semibold px-3 py-0.5 rounded shadow-sm"
            style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
          >
            {tx.transactionType}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{tx.transactionType || "—"}</span>
        )}
        <span className="text-xs text-muted-foreground">{tx.recordingDate || "—"}</span>
      </div>

      <div className="grid grid-cols-2 gap-1 text-xs">
        <div>
          <span className="text-muted-foreground">Sale Date: </span>
          <span>{tx.saleDate || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Buyer: </span>
          <span>{tx.buyerName || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Seller: </span>
          <span>{tx.sellerName || "—"}</span>
        </div>
        {tx.salePrice && (
          <div>
            <span className="text-muted-foreground">Price: </span>
            <span>${Number(tx.salePrice).toLocaleString()}</span>
          </div>
        )}
        {tx.firstMtgLenderName && (
          <div>
            <span className="text-muted-foreground">Lender: </span>
            <span>{tx.firstMtgLenderName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function UpdatePropertyContent({
  onClose,
  propertyId,
  initialData,
  onSuccess,
}: UpdatePropertyContentProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TxEditForm>(emptyEditForm());

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/transactions`)
      .then((r) => r.json())
      .then((data: Array<{
        id: number;
        transactionType: string | null;
        recordingDate: string;
        saleDate: string;
        buyerName: string | null;
        sellerName: string | null;
        salePrice: string | null;
        firstMtgLenderName: string | null;
      }>) => {
        setTransactions(
          data.map((tx) => ({
            _key: String(tx.id),
            transactionType: tx.transactionType ?? "",
            recordingDate: tx.recordingDate ?? "",
            saleDate: tx.saleDate ?? "",
            buyerName: tx.buyerName ?? "",
            sellerName: tx.sellerName ?? "",
            salePrice: tx.salePrice ?? "",
            firstMtgLenderName: tx.firstMtgLenderName ?? "",
          }))
        );
      })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [propertyId]);

  function startAdd() {
    const key = `new-${Date.now()}`;
    setEditingKey(key);
    setEditForm(emptyEditForm());
    setTransactions((prev) => [{ _key: key, ...emptyEditForm() }, ...prev]);
  }

  function applyEdit() {
    setTransactions((prev) =>
      prev.map((tx) => (tx._key === editingKey ? { _key: tx._key, ...editForm } : tx))
    );
    setEditingKey(null);
  }

  function cancelEdit() {
    setTransactions((prev) => prev.filter((tx) => tx._key !== editingKey));
    setEditingKey(null);
  }

  const safeStatuses = initialData.statuses.filter((s): s is PropertyStatus =>
    (PROPERTY_STATUSES as readonly string[]).includes(s)
  );

  const form = useForm<UpdatePropertyFormValues>({
    resolver: zodResolver(updatePropertyFormSchema),
    defaultValues: {
      isArvFunded: initialData.isArvFunded,
      statuses: safeStatuses.length > 0 ? safeStatuses : ["in-renovation"],
    },
  });

  const handleSubmit = async (data: UpdatePropertyFormValues) => {
    setIsLoading(true);
    try {
      const newTransactions = transactions.filter((tx) => tx._key.startsWith("new-"));
      await apiRequest("PATCH", `/api/properties/${propertyId}`, {
        isArvFunded: data.isArvFunded,
        statuses: data.statuses,
        ...(newTransactions.length > 0 && {
          transactions: newTransactions.map((tx) => ({
            transactionType: tx.transactionType || null,
            recordingDate: tx.recordingDate,
            saleDate: tx.saleDate,
            buyerName: tx.buyerName || null,
            sellerName: tx.sellerName || null,
            salePrice: tx.salePrice || null,
            firstMtgLenderName: tx.firstMtgLenderName || null,
          })),
        }),
      });
      toast({ title: "Property Updated", description: "Property has been successfully updated." });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/properties");
        },
      });
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update property",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Property</DialogTitle>
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
                  value={field.value ? "true" : "false"}
                  onValueChange={(val) => field.onChange(val === "true")}
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
                            field.onChange(field.value.filter((s) => s !== status));
                          } else {
                            field.onChange([...field.value, status]);
                          }
                        }}
                        className={`flex-1 h-9 flex items-center justify-center text-xs font-medium transition-colors whitespace-nowrap${isLast ? "" : " border-r border-border"} ${
                          active ? "text-white" : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        style={active ? { backgroundColor: STATUS_CONFIG[status].color } : undefined}
                        data-testid={`button-status-${status}`}
                      >
                        {STATUS_CONFIG[status].label}
                      </button>
                    );
                  })}
                </div>
                {fieldState.error && (
                  <p className="text-sm text-destructive">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />

          {/* Transactions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium leading-none">Transactions</label>
              {!editingKey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs px-2"
                  onClick={startAdd}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Transaction
                </Button>
              )}
            </div>

            {txLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 && !editingKey ? (
              <p className="text-xs text-muted-foreground py-2">No transactions recorded.</p>
            ) : (
              <div
                className="space-y-2 overflow-y-auto pr-1"
                style={{ maxHeight: "18rem" }}
                onWheel={(e) => e.stopPropagation()}
              >
                {transactions.map((tx) =>
                  editingKey === tx._key ? (
                    <TxEditRow
                      key={tx._key}
                      form={editForm}
                      onChange={(field, val) => setEditForm((prev) => ({ ...prev, [field]: val }))}
                      onApply={applyEdit}
                      onCancel={cancelEdit}
                      county={initialData.county}
                    />
                  ) : (
                    <TxDisplayCard
                      key={tx._key}
                      tx={tx}
                    />
                  )
                )}
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
              disabled={isLoading || !!editingKey}
              data-testid="button-save-update-property"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
