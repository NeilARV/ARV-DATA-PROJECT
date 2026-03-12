import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useDeleteProperty } from "@/hooks/properties/useDeleteProperty";
import { PropertyContent } from "./PropertyContent";

export default function PropertyDetailModal() {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { property, setProperty } = useProperty();
  const { isAdminOrOwner } = useAuth();
  const { handleCompanyClick } = useCompanies();
  const deletePropertyMutation = useDeleteProperty(() => setShowDeleteDialog(false));

  if (!property) return null;

  return (
    <Dialog open={!!property} onOpenChange={() => setProperty(null)}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="modal-property-detail"
      >
        <PropertyContent
          variant="modal"
          property={property}
          isAdminOrOwner={isAdminOrOwner}
          onDeleteClick={() => setShowDeleteDialog(true)}
          deleteIsPending={deletePropertyMutation.isPending}
          onCompanyClick={(name, id, isBuyer) => {
            handleCompanyClick(name, id, isBuyer);
            setProperty(null);
          }}
        />
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          if (property.id) deletePropertyMutation.mutate(property.id);
        }}
        title="Delete Property"
        description={`Are you sure you want to delete ${property.address}, ${property.city}, ${property.state}?`}
        confirmText="Yes"
        cancelText="No"
        variant="destructive"
        isLoading={deletePropertyMutation.isPending}
      />
    </Dialog>
  );
}
