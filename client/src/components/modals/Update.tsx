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
import { Loader2, User, Mail, Phone, Pencil, Trash2, Plus, Briefcase } from "lucide-react";
import { updateCompanySchema } from "@database/updates/companies.update";
import { UpdateDialogProps } from "@/types/general";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import AddContactContent from "@/components/modals/AddContact";

type UpdateContentProps = Omit<UpdateDialogProps, "open" | "onClose"> & {
  onClose: () => void;
};

interface ContactCardProps {
  contact: CompanyContact;
  onEdit: (contact: CompanyContact) => void;
  onDelete: (contact: CompanyContact) => void;
}

function ContactCard({ contact, onEdit, onDelete }: ContactCardProps) {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const phone = contact.phoneNumber ? formatPhoneNumber(contact.phoneNumber) : null;
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1.5 min-w-0">
          {fullName && (
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{fullName}</span>
            </div>
          )}
          {contact.title && (
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{contact.title}</span>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground truncate">{contact.email}</span>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{phone}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(contact)}
            data-testid="button-edit-contact"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(contact)}
            data-testid="button-delete-contact"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
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

  const [contactToDelete, setContactToDelete] = useState<CompanyContact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editContact, setEditContact] = useState<CompanyContact | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);

  const form = useForm<UpdateCompany>({
    resolver: zodResolver(updateCompanySchema),
    defaultValues: { isArvClient: false },
  });

  const fetchCompany = () => {
    if (!companyId) return;
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
  };

  useEffect(() => {
    if (!companyId) return;
    if (initialData) {
      setCompanyName(initialData.companyName ?? "");
      form.reset({ isArvClient: initialData.isArvClient ?? false });
    }
    fetchCompany();
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

  const handleDeleteContact = async () => {
    if (!companyId || !contactToDelete) return;
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/companies/${companyId}/contacts/${contactToDelete.id}`);
      toast({ title: "Contact Deleted", description: "Contact has been removed." });
      setContacts((prev) => prev.filter((c) => c.id !== contactToDelete.id));
      setContactToDelete(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete contact", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleContactSuccess = (contact: CompanyContact, mode: "add" | "edit") => {
    if (mode === "add") {
      setContacts((prev) => [...prev, contact]);
    } else {
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none">Contacts</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs px-2"
                  onClick={() => setShowAddContact(true)}
                  data-testid="button-add-contact"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Contact
                </Button>
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts on file.</p>
              ) : (
                <div
                  className="space-y-2 overflow-y-auto pr-1"
                  style={{ maxHeight: contacts.length > 3 ? "224px" : undefined }}
                >
                  {contacts.map((contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      onEdit={(c) => setEditContact(c)}
                      onDelete={(c) => setContactToDelete(c)}
                    />
                  ))}
                </div>
              )}
            </div>

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

      {/* Add / Edit contact dialog */}
      <AppDialog
        hideOverlay
        open={showAddContact || !!editContact}
        onClose={() => {
          setShowAddContact(false);
          setEditContact(null);
        }}
        className="max-w-md"
      >
        {companyId && (showAddContact || editContact) && (
          <AddContactContent
            companyId={companyId}
            contact={editContact}
            onClose={() => {
              setShowAddContact(false);
              setEditContact(null);
            }}
            onSuccess={handleContactSuccess}
          />
        )}
      </AppDialog>

      {/* Delete confirmation dialog */}
      <AppDialog
        hideOverlay
        open={!!contactToDelete}
        onClose={() => setContactToDelete(null)}
        className="max-w-md"
      >
        {contactToDelete && (
          <ConfirmationContent
            onClose={() => setContactToDelete(null)}
            onConfirm={handleDeleteContact}
            title="Delete Contact"
            description={`Are you sure you want to delete ${[contactToDelete.firstName, contactToDelete.lastName].filter(Boolean).join(" ")}? This cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            variant="destructive"
            isLoading={isDeleting}
          />
        )}
      </AppDialog>
    </>
  );
}
