import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCompanies } from '@/hooks/useCompanies';
import { useProperty } from '@/hooks/useProperty';
import { useDeleteProperty } from '@/hooks/properties/useDeleteProperty';
import { PropertyContent } from './PropertyContent';
import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';
import { UpdatePropertyDialog } from './UpdatePropertyDialog';

interface PropertyModalContentProps {
    onClose: () => void;
}

export default function PropertyModalContent({ onClose }: PropertyModalContentProps) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const { property, fetchProperty } = useProperty();
    const { isAdmin, isOwner } = useAuth();
    const { handleCompanyClick } = useCompanies();
    const deletePropertyMutation = useDeleteProperty(() => setShowDeleteDialog(false));

    useEffect(() => {
        if (property?.id) fetchProperty(property.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [property?.id]);

    if (!property) return null;

    return (
        <>
            <PropertyContent
                variant="modal"
                property={property}
                isAdminOrOwner={isAdmin || isOwner}
                onEditClick={() => setShowEditDialog(true)}
                onDeleteClick={() => setShowDeleteDialog(true)}
                deleteIsPending={deletePropertyMutation.isPending}
                onCompanyClick={(name, id, isBuyer) => {
                    handleCompanyClick(name, id, isBuyer);
                    onClose();
                }}
            />

            <AppDialog
                nested
                open={showEditDialog}
                onClose={() => setShowEditDialog(false)}
                className="max-w-md"
            >
                <UpdatePropertyDialog
                    onClose={() => setShowEditDialog(false)}
                    propertyId={property.id}
                    initialData={{
                        isArvFunded: property.isFinancedByARV,
                        statuses: property.statuses ?? [property.status],
                        county: property.county,
                    }}
                    onSuccess={() => fetchProperty(property.id)}
                />
            </AppDialog>

            <AppDialog
                nested
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
