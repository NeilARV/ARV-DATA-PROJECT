import { useState } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
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
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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
  statuses: z
    .array(z.enum(PROPERTY_STATUSES))
    .min(1, "At least one status is required"),
});

type UpdatePropertyFormValues = z.infer<typeof updatePropertyFormSchema>;

type UpdatePropertyContentProps = {
  onClose: () => void;
  propertyId: string;
  initialData: {
    isArvFunded: boolean;
    statuses: string[];
  };
  onSuccess?: () => void;
};

export default function UpdatePropertyContent({
  onClose,
  propertyId,
  initialData,
  onSuccess,
}: UpdatePropertyContentProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
      await apiRequest("PATCH", `/api/properties/${propertyId}`, {
        isArvFunded: data.isArvFunded,
        statuses: data.statuses,
      });
      toast({
        title: "Property Updated",
        description: "Property has been successfully updated.",
      });
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
        description:
          error instanceof Error ? error.message : "Failed to update property",
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
                  <SelectContent className="z-[10000]">
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Statuses — segmented toggle strip matching FilterHeader style */}
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
                            // Don't allow deselecting the last active status
                            if (field.value.length <= 1) return;
                            field.onChange(field.value.filter((s) => s !== status));
                          } else {
                            field.onChange([...field.value, status]);
                          }
                        }}
                        className={`flex-1 h-9 flex items-center justify-center text-xs font-medium transition-colors whitespace-nowrap${isLast ? "" : " border-r border-border"} ${
                          active
                            ? "text-white"
                            : "bg-background text-muted-foreground hover:bg-muted"
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
              disabled={isLoading}
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
