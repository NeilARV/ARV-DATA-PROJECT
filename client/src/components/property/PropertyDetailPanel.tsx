import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import UpdatePropertyContent from "@/components/modals/UpdateProperty";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useDeleteProperty } from "@/hooks/properties/useDeleteProperty";
import { PropertyContent } from "./PropertyContent";

export default function PropertyDetailPanel() {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { isAdminOrOwner } = useAuth();
  const { handleCompanyClick } = useCompanies();
  const { property, setProperty, fetchProperty } = useProperty();
  const deletePropertyMutation = useDeleteProperty(() => setShowDeleteDialog(false));

  if (!property) return null;

  return (
    <div
      className={`${property ? "visible" : "invisible"} w-96 flex-shrink-0 h-full bg-background border-r border-border overflow-y-auto`}
      data-testid="panel-property-detail"
    >
      <div className="sticky top-0 z-10 bg-background border-b border-border p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Property Details</h2>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setProperty(null)}
          data-testid="button-close-panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4">
        <PropertyContent
          variant="panel"
          property={property}
          isAdminOrOwner={isAdminOrOwner}
          onEditClick={() => setShowEditDialog(true)}
          onDeleteClick={() => setShowDeleteDialog(true)}
          deleteIsPending={deletePropertyMutation.isPending}
          onCompanyClick={(name, id, isBuyer) =>
            handleCompanyClick(name, id, isBuyer)
          }
        />
      </div>

      {/* Edit Dialog */}
      <AppDialog open={showEditDialog} onClose={() => setShowEditDialog(false)} className="max-w-md">
        {showEditDialog && (
          <UpdatePropertyContent
            onClose={() => setShowEditDialog(false)}
            propertyId={property.id}
            initialData={{
              isArvFunded: property.isFinancedByARV,
              statuses: property.statuses ?? (property.status ? [property.status] : ["in-renovation"]),
              county: property.county,
            }}
            onSuccess={() => fetchProperty(property.id)}
          />
        )}
      </AppDialog>

      {/* Delete Confirmation Dialog */}
      <AppDialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)} className="max-w-md">
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
    </div>
  );
}
