import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useDeleteProperty } from "@/hooks/properties/useDeleteProperty";
import { PropertyContent } from "./PropertyContent";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";

interface PropertyModalContentProps {
  onClose: () => void;
}

export default function PropertyModalContent({ onClose }: PropertyModalContentProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { property } = useProperty();
  const { isAdminOrOwner } = useAuth();
  const { handleCompanyClick } = useCompanies();
  const deletePropertyMutation = useDeleteProperty(() => setShowDeleteDialog(false));

  if (!property) return null;

  return (
    <>
      <PropertyContent
        variant="modal"
        property={property}
        isAdminOrOwner={isAdminOrOwner}
        onDeleteClick={() => setShowDeleteDialog(true)}
        deleteIsPending={deletePropertyMutation.isPending}
        onCompanyClick={(name, id, isBuyer) => {
          handleCompanyClick(name, id, isBuyer);
          onClose();
        }}
      />

      <AppDialog
        hideOverlay
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        className="max-w-md"
      >
        <ConfirmationContent
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
      </AppDialog>
    </>
  );
}
