import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CompanyContact, UpdateCompanyContact } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { formatPhoneNumber } from "@/utils/formatPhoneNumber";

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  onSuccess?: () => void;
}

// Form schema that accepts empty strings (will be converted to null/undefined before API call)
const updateCompanyContactFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"), // Required for display, but readonly
  contactName: z.string().optional(),
  contactEmail: z.string().refine(
    (val) => !val || val === "" || z.string().email().safeParse(val).success,
    "Invalid email address"
  ).optional(),
  phoneNumber: z.string().optional(),
});

type UpdateCompanyContactForm = z.infer<typeof updateCompanyContactFormSchema>;

export default function UpdateDialog({
  open,
  onClose,
  companyId,
  onSuccess,
}: UpdateDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const form = useForm<UpdateCompanyContactForm>({
    resolver: zodResolver(updateCompanyContactFormSchema),
    defaultValues: {
      companyName: "",
      contactName: "",
      contactEmail: "",
      phoneNumber: "",
    },
  });

  // Fetch company data when dialog opens and companyId is provided
  useEffect(() => {
    if (open && companyId) {
      setIsFetching(true);
      fetch(`/api/companies/${companyId}`, {
        credentials: "include",
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch company contact");
          }
          return res.json();
        })
        .then((data: CompanyContact) => {
          // Format phone number if it exists and isn't already formatted
          const phoneNumber = data.phoneNumber 
            ? (data.phoneNumber.includes('(') ? data.phoneNumber : formatPhoneNumber(data.phoneNumber))
            : "";
          
          form.reset({
            companyName: data.companyName || "",
            contactName: data.contactName || "",
            contactEmail: data.contactEmail || "",
            phoneNumber: phoneNumber,
          });
        })
        .catch((error) => {
          console.error("Error fetching company contact:", error);
          toast({
            title: "Error",
            description: "Failed to load company contact information",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsFetching(false);
        });
    } else if (!open) {
      // Reset form when dialog closes
      form.reset();
    }
  }, [open, companyId, form, toast]);

  const handleSubmit = async (data: UpdateCompanyContactForm) => {
    if (!companyId) {
      return;
    }

    setIsLoading(true);

    try {
      // Prepare update data (convert empty strings to null/undefined)
      // Note: companyName is excluded from updates as it should not be changed
      const updateData: UpdateCompanyContact = {
        contactName: data.contactName && data.contactName.trim() !== "" ? data.contactName : null,
        contactEmail: data.contactEmail && data.contactEmail.trim() !== "" ? data.contactEmail : null,
        phoneNumber: data.phoneNumber && data.phoneNumber.trim() !== "" ? data.phoneNumber : null,
      };

      await apiRequest("PATCH", `/api/companies/${companyId}`, updateData);

      toast({
        title: "Company Contact Updated",
        description: "Company contact has been successfully updated.",
      });

      // Invalidate company contacts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/companies/contacts"] });

      onSuccess?.();
      onClose();
    } catch (error: any) {
      const errorMessage = error.message || "Failed to update company contact";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-update-company">
        <DialogHeader>
          <DialogTitle>Edit Company Contact</DialogTitle>
        </DialogHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Company Name"
                        readOnly
                        className="bg-muted cursor-not-allowed"
                        data-testid="input-company-name"
                      />
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
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="Contact Name"
                        data-testid="input-contact-name"
                      />
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
                      <Input
                        {...field}
                        value={field.value || ""}
                        type="email"
                        placeholder="contact@example.com"
                        data-testid="input-contact-email"
                      />
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
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
                          field.onChange(formatted);
                        }}
                        maxLength={14} // (XXX) XXX-XXXX = 14 characters
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                  disabled={isLoading}
                  data-testid="button-cancel-update"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                  data-testid="button-save-update"
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
        )}
      </DialogContent>
    </Dialog>
  );
}

