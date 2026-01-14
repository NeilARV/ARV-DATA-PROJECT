import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bed, Bath, Maximize2, MapPin, Calendar, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { formatDate, calculateDaysOwned } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";

interface PropertyDetailModalProps {
  property: Property | null;
  open: boolean;
  onClose: () => void;
  onCompanyNameClick?: (companyName: string, companyId?: string, keepPanelOpen?: boolean) => void;
}

export default function PropertyDetailModal({
  property,
  open,
  onClose,
  onCompanyNameClick,
}: PropertyDetailModalProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (property) {

      setIsLoading(true)

      if (property.imageUrl) {
        setImageUrl(property.imageUrl);
        setIsLoading(false);
      } else {
        getStreetViewUrl(property.address, property.city, property.state, "800x450", property.id)
          .then(url => {
            if (url) {
              // Test if the image loads, if not, set to empty to show "No image available"
              const img = new Image();
              img.onload = () => {
                setImageUrl(url);
                setIsLoading(false);
              };
              img.onerror = () => {
                // Image failed to load (likely 404 from metadata check)
                setImageUrl("");
                setIsLoading(false);
              };
              img.src = url;
            } else {
              // No URL returned
              setImageUrl("");
              setIsLoading(false);
            }
          })
          .catch(() => {
            // If URL generation fails or fetch fails, show "No image available" text
            setImageUrl("");
            setIsLoading(false);
          });
      }
    }
  }, [property]);

  const handleRequestContact = () => {
    setShowContactDialog(true);
  };

  const handleSubmitRequest = () => {
    if (!requestName.trim() || !requestEmail.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both your name and email.",
        variant: "destructive",
      });
      return;
    }

    // Create mailto link
    const subject = `Contact Request for ${property?.companyContactName || 'Property'}`;
    const body = `Name: ${requestName}\nEmail: ${requestEmail}\n\nRequesting contact information for:\nProperty: ${property?.address}\nCompany Contact: ${property?.companyContactName}`;
    const mailtoLink = `mailto:neil@arvfinance.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.location.href = mailtoLink;
    
    toast({
      title: "Request Sent",
      description: "Your contact request has been sent to neil@arvfinance.com",
    });

    // Reset and close
    setShowContactDialog(false);
    setRequestName('');
    setRequestEmail('');
  };

  const deletePropertyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/properties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/map"] });
      toast({
        title: "Success",
        description: "Property has been deleted",
      });
      setShowDeleteDialog(false);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete property",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    if (property?.id) {
      deletePropertyMutation.mutate(property.id);
    }
  };

  if (!property) return null;

  const pricePerSqft = Math.round(property.price / property.squareFeet);
  const formattedDateSold = formatDate(property.dateSold);
  const daysOwned = calculateDaysOwned(property.dateSold);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="modal-property-detail">
        <div className="space-y-4">
          <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={property.address}
                className="w-full h-full object-cover"
                data-testid="img-property-detail"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No image available
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Purchase Price</p>
              <div className="text-3xl font-bold" data-testid="text-detail-price">
                ${property.price.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-lg font-medium">{property.address}</div>
              <div className="text-muted-foreground">
                {property.city}, {property.state} {property.zipCode}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Bed className="w-4 h-4" />
                <span data-testid="text-detail-beds">{property.bedrooms} bd</span>
              </div>
              <div className="flex items-center gap-1">
                <Bath className="w-4 h-4" />
                <span data-testid="text-detail-baths">{property.bathrooms} ba</span>
              </div>
              <div className="flex items-center gap-1">
                <Maximize2 className="w-4 h-4" />
                <span data-testid="text-detail-sqft">{property.squareFeet.toLocaleString()} sqft</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Property Type</div>
                <div className="font-medium">{property.propertyType}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">Price per Sqft</div>
                <div className="font-medium">${pricePerSqft}</div>
              </div>

              {property.propertyOwner && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Property Owner</div>
                  <div className="flex items-start gap-1">
                    <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {onCompanyNameClick ? (
                      <button
                        onClick={() => {
                          const propertyWithId = property as Property & { propertyOwnerId?: string | null };
                          onCompanyNameClick(property.propertyOwner!, propertyWithId.propertyOwnerId || undefined, true);
                          onClose(); // Close modal so user can see company directory
                        }}
                        className="font-medium text-primary hover:underline text-left"
                        data-testid="text-property-owner"
                      >
                        {property.propertyOwner}
                      </button>
                    ) : (
                      <span className="font-medium" data-testid="text-property-owner">{property.propertyOwner}</span>
                    )}
                  </div>
                </div>
              )}

              {daysOwned !== null && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Days Owned</div>
                  <div className="font-medium">{daysOwned} days</div>
                </div>
              )}

              {property.companyContactName && (
                <div className="col-span-2">
                  <div className="text-sm text-muted-foreground mb-1">Company Contact</div>
                  <div className="font-medium mb-2" data-testid="text-company-contact">
                    {property.companyContactName}
                  </div>
                  <Button 
                    size="sm"
                    variant="default"
                    onClick={handleRequestContact}
                    data-testid="button-request-contact"
                  >
                    Request Contact
                  </Button>
                </div>
              )}

              {formattedDateSold && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Purchased Date</div>
                  <div className="flex items-start gap-1">
                    <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{formattedDateSold}</span>
                  </div>
                </div>
              )}

              <div className="col-span-2">
                <div className="text-sm text-muted-foreground mb-1">Location</div>
                <div className="flex items-start gap-1 text-sm">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <div>{property.address}</div>
                    <div>{property.city}, {property.state} {property.zipCode}</div>
                    {property.latitude !== null && property.longitude !== null && (
                      <div className="text-muted-foreground mt-1">
                        Coordinates: {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {user?.isAdmin && (
                <div className="col-span-2 pt-4">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteClick}
                    disabled={deletePropertyMutation.isPending}
                    className="w-full"
                    data-testid="button-delete-property"
                  >
                    Delete Property
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Contact Request Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-contact-request">
          <DialogHeader>
            <DialogTitle>Where do we send this info?</DialogTitle>
            <DialogDescription>
              Please provide your contact information so we can send you the details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="request-name">Name</Label>
              <Input
                id="request-name"
                placeholder="Your name"
                value={requestName}
                onChange={(e) => setRequestName(e.target.value)}
                data-testid="input-request-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="request-email">Email</Label>
              <Input
                id="request-email"
                type="email"
                placeholder="your@email.com"
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
                data-testid="input-request-email"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowContactDialog(false)}
              className="flex-1"
              data-testid="button-cancel-request"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitRequest}
              className="flex-1"
              data-testid="button-submit-request"
            >
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {property && (
        <ConfirmationDialog
          open={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={handleConfirmDelete}
          title="Delete Property"
          description={`Are you sure you want to delete ${property.address}, ${property.city}, ${property.state}?`}
          confirmText="Yes"
          cancelText="No"
          variant="destructive"
          isLoading={deletePropertyMutation.isPending}
        />
      )}
    </Dialog>
  );
}

