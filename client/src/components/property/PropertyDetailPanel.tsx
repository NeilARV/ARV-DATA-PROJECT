import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useDeleteProperty } from "@/hooks/properties/useDeleteProperty";
import { PropertyContent } from "./PropertyContent";

export default function PropertyDetailPanel() {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { isAdminOrOwner } = useAuth();
  const { handleCompanyClick } = useCompanies();
  const { property, setProperty } = useProperty();
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
          onDeleteClick={() => setShowDeleteDialog(true)}
          deleteIsPending={deletePropertyMutation.isPending}
          onCompanyClick={(name, id, isBuyer) =>
            handleCompanyClick(name, id, isBuyer)
          }
        />
      </div>

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
    </div>
  );
}
