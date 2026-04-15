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
import { UpdateCompany } from "@database/types";
import type { CompanyContact, CompanyContactDetail } from "@/types/companies";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Mail, Phone } from "lucide-react";
import { updateCompanySchema } from "@database/updates/companies.update";
import { UpdateDialogProps } from "@/types/general";

type UpdateContentProps = Omit<UpdateDialogProps, "open" | "onClose"> & {
  onClose: () => void;
};

function ContactCard({ contact }: { contact: CompanyContact }) {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-1.5 text-sm">
      {fullName && (
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium">{fullName}</span>
        </div>
      )}
      {contact.email && (
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{contact.email}</span>
        </div>
      )}
      {contact.phoneNumber && (
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{contact.phoneNumber}</span>
        </div>
      )}
    </div>
  );
}

export default function UpdateContent({
  onClose,
  companyId,
  initialData,
  onSuccess,
}: UpdateContentProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [companyName, setCompanyName] = useState<string>("");
  const [contacts, setContacts] = useState<CompanyContact[]>([]);

  const form = useForm<UpdateCompany>({
    resolver: zodResolver(updateCompanySchema),
    defaultValues: { isArvClient: false },
  });

  useEffect(() => {
    if (!companyId) return;

    if (initialData) {
      setCompanyName(initialData.companyName ?? "");
      form.reset({ isArvClient: initialData.isArvClient ?? false });
      // Still fetch contacts since initialData doesn't carry them
    }

    setIsFetching(true);
    fetch(`/api/companies/${companyId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch company");
        return res.json();
      })
      .then((data: CompanyContactDetail) => {
        setCompanyName(data.companyName ?? "");
        setContacts(data.contacts ?? []);
        if (!initialData) {
          form.reset({ isArvClient: data.isArvClient ?? false });
        }
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to load company information", variant: "destructive" });
      })
      .finally(() => setIsFetching(false));
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (data: UpdateCompany) => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      await apiRequest("PATCH", `/api/companies/${companyId}`, { isArvClient: data.isArvClient });
      toast({ title: "Company Updated", description: "Company has been successfully updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update company", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Company</DialogTitle>
      </DialogHeader>

      {isFetching ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Company Name *</label>
              <Input value={companyName} readOnly className="bg-muted cursor-not-allowed" data-testid="input-company-name" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Contacts</label>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts on file.</p>
              ) : (
                <div
                  className="space-y-4 overflow-y-auto pr-4"
                  style={{ maxHeight: contacts.length > 3 ? "224px" : undefined }}
                >
                  {contacts.map((contact) => (
                    <ContactCard key={contact.id} contact={contact} />
                  ))}
                </div>
              )}
            </div>

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
