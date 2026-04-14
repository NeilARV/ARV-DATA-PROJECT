import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Company, UpdateCompany } from "@database/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";
import { updateCompanySchema } from "@database/updates/companies.update";
import { UpdateDialogProps } from "@/types/general";

type UpdateContentProps = Omit<UpdateDialogProps, "open" | "onClose"> & {
  onClose: () => void;
};

export default function UpdateContent({
  onClose,
  companyId,
  initialData,
  onSuccess,
}: UpdateContentProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const form = useForm<UpdateCompany>({
    resolver: zodResolver(updateCompanySchema),
    defaultValues: { companyName: "", contactName: "", contactEmail: "", phoneNumber: "", isArvClient: false },
  });

  useEffect(() => {
    if (!companyId) return;

    if (initialData) {
      const phoneNumber = initialData.phoneNumber
        ? initialData.phoneNumber.includes("(") ? initialData.phoneNumber : formatPhoneNumber(initialData.phoneNumber)
        : "";
      form.reset({
        companyName: initialData.companyName ?? "",
        contactName: initialData.contactName ?? "",
        contactEmail: initialData.contactEmail ?? "",
        phoneNumber,
        isArvClient: initialData.isArvClient ?? false,
      });
      return;
    }

    setIsFetching(true);
    fetch(`/api/companies/${companyId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch company contact");
        return res.json();
      })
      .then((data: Company) => {
        const phoneNumber = data.phoneNumber
          ? data.phoneNumber.includes("(") ? data.phoneNumber : formatPhoneNumber(data.phoneNumber)
          : "";
        form.reset({
          companyName: data.companyName ?? "",
          contactName: data.contactName ?? "",
          contactEmail: data.contactEmail ?? "",
          phoneNumber,
          isArvClient: data.isArvClient ?? false,
        });
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to load company contact information", variant: "destructive" });
      })
      .finally(() => setIsFetching(false));
  }, [companyId, initialData, form, toast]);

  const handleSubmit = async (data: UpdateCompany) => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const updateData: UpdateCompany = {
        contactName: data.contactName?.trim() || null,
        contactEmail: data.contactEmail?.trim() || null,
        phoneNumber: data.phoneNumber?.trim() || null,
        isArvClient: data.isArvClient,
      };
      await apiRequest("PATCH", `/api/companies/${companyId}`, updateData);
      toast({ title: "Company Contact Updated", description: "Company contact has been successfully updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/contacts"] });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update company contact", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Company Contact</DialogTitle>
      </DialogHeader>

      {isFetching ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Company Name" readOnly className="bg-muted cursor-not-allowed" data-testid="input-company-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} placeholder="Contact Name" data-testid="input-contact-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Email</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} type="email" placeholder="contact@example.com" data-testid="input-contact-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      type="tel"
                      placeholder="(555) 123-4567"
                      data-testid="input-phone-number"
                      onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                      maxLength={14}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isArvClient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ARV Client</FormLabel>
                  <Select
                    value={field.value ? "true" : "false"}
                    onValueChange={(val) => field.onChange(val === "true")}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-arv-client">
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
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isLoading} data-testid="button-cancel-update">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading} data-testid="button-save-update">
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
      )}
    </>
  );
}
