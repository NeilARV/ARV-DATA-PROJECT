import type { Property } from "@/types/property";
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
import { Bed, Bath, Maximize2, MapPin, Calendar, Building2, User, Mail, Phone } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { formatDate, calculateDaysOwned } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";
import { StatusTag } from "./StatusTag";
import { formatAddress } from "@shared/utils/formatAddress";
import { isNegative } from "@/utils/isNegative";

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
  const { isAdminOrOwner } = useAuth();

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
    const contactNames = [property?.buyerContactName, property?.sellerContactName].filter(Boolean).join(', ') || 'Property';
    const companyNames = [property?.buyerCompanyName, property?.sellerCompanyName].filter(Boolean).join(', ');
    const subject = `Contact Request for ${contactNames}`;
    const body = `Name: ${requestName}\nEmail: ${requestEmail}\n\nRequesting contact information for:\nProperty: ${property?.address}\n${companyNames ? `Companies: ${companyNames}\n` : ''}${contactNames !== 'Property' ? `Contacts: ${contactNames}` : ''}`;
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

  const pricePerSqft = property.squareFeet > 0 ? Math.round(property.price / property.squareFeet) : 0;
  const priceLabel = (property.status || "").toLowerCase().trim() === "sold" ? "Sold Price" : "Purchase Price";
  const dateLabel = ["wholesale", "in-renovation"].includes((property.status || "").toLowerCase().trim())
    ? "Date Purchased"
    : "Date Sold";
  const formattedDateSold = formatDate(property.dateSold);
  const formattedBuyerPurchaseDate = formatDate(property.buyerPurchaseDate);
  const formattedSellerPurchaseDate = formatDate(property.sellerPurchaseDate);
  const daysOwned = calculateDaysOwned(property.dateSold);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="modal-property-detail">
        <div className="space-y-4">
          <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted relative">
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
            <div className="absolute top-2 right-2 flex gap-2 items-end">
              <StatusTag status={property.status} section={"modal"}/>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-sm text-muted-foreground">
                  {priceLabel}
                </p>
                <div className="text-2xl font-bold" data-testid="text-detail-price">
                  ${property.price.toLocaleString()}
                </div>
              </div>

              <div className="flex items-start gap-6 text-sm">
                <div className="flex flex-col items-end" data-testid="text-date-sold-detail">
                  <span className="text-sm text-muted-foreground mb-1">{dateLabel}</span>
                  <div className="flex items-center gap-1 font-semibold text-foreground">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>
                      {formattedDateSold ? (
                        formattedDateSold
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-lg font-medium">{formatAddress(property.address)}</div>
              <div className="text-muted-foreground">
                {formatAddress(property.city)}, {property.state} {property.zipCode}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Bed className="w-4 h-4 text-muted-foreground" />
                <span data-testid="text-detail-beds">{property.bedrooms} bd</span>
              </div>
              <div className="flex items-center gap-1">
                <Bath className="w-4 h-4 text-muted-foreground" />
                <span data-testid="text-detail-baths">{property.bathrooms} ba</span>
              </div>
              <div className="flex items-center gap-1">
                <Maximize2 className="w-4 h-4 text-muted-foreground" />
                <span data-testid="text-detail-sqft">{property.squareFeet.toLocaleString()} sqft</span>
              </div>
            </div>

            <div className="text-sm text-muted-foreground mt-2">
              {property.propertyType}
            </div>
            {(property.squareFeet > 0 || daysOwned !== null) && (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-detail-meta">
                {[
                  property.squareFeet > 0 && `$${pricePerSqft}/sqft`,
                  daysOwned !== null && `${daysOwned} days owned`,
                ].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Buyer (left) / Seller (right) - same layout as PropertyCard; clickable only when id exists */}
            <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-4 items-stretch">
              <div className="min-w-0 flex flex-col items-start text-left overflow-hidden">
                <div className="min-w-0 flex-1 w-full overflow-hidden">
                  <div className="text-xs text-muted-foreground">Buyer</div>
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground mt-0.5 min-w-0 overflow-hidden w-full">
                    <Building2 className="w-4 h-4 flex-shrink-0 text-primary" />
                    {onCompanyNameClick && property.buyerId ? (
                      <button
                        onClick={() => {
                          onCompanyNameClick(
                            property.buyerCompanyName || property.companyName || property.propertyOwner || "",
                            property.buyerId || undefined,
                            true
                          );
                          onClose();
                        }}
                        className="truncate text-primary hover:underline text-left min-w-0"
                        data-testid="text-buyer-company-name"
                      >
                        {property.buyerCompanyName || property.companyName || property.propertyOwner || "—"}
                      </button>
                    ) : (
                      <p className="truncate text-primary text-left min-w-0 m-0" data-testid="text-buyer-company-name">
                        {property.buyerCompanyName || property.companyName || property.propertyOwner || "—"}
                      </p>
                    )}
                  </div>
                  {property.buyerPurchasePrice != null && property.buyerPurchasePrice > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <span className="font-medium text-foreground">${Number(property.buyerPurchasePrice).toLocaleString()}</span>
                      {property.buyerPurchaseDate && formattedBuyerPurchaseDate && (
                        <div className="text-muted-foreground">{formattedBuyerPurchaseDate}</div>
                      )}
                    </div>
                  )}
                  {(property.buyerContactName || property.buyerContactEmail || property.buyerContactPhone) && (
                    <div className="text-sm text-muted-foreground mt-1.5 space-y-1 min-w-0 overflow-hidden w-full">
                      {property.buyerContactName && (
                        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden" data-testid="text-buyer-contact">
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{property.buyerContactName}</span>
                        </div>
                      )}
                      {property.buyerContactEmail && (
                        <a href={`mailto:${property.buyerContactEmail}`} className="flex items-center gap-1.5 text-muted-foreground hover:underline min-w-0 overflow-hidden">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{property.buyerContactEmail}</span>
                        </a>
                      )}
                      {property.buyerContactPhone && (
                        <a href={`tel:${property.buyerContactPhone.replace(/\D/g, "")}`} className="flex items-center gap-1.5 min-w-0 overflow-hidden text-muted-foreground hover:underline">
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{property.buyerContactPhone}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex flex-col items-end text-right overflow-hidden">
                <div className="min-w-0 flex-1 w-full flex flex-col items-end overflow-hidden">
                  <div className="text-xs text-muted-foreground w-full text-right">Seller</div>
                  <div className="flex items-center justify-end gap-1.5 font-semibold text-sm text-foreground mt-0.5 min-w-0 w-full overflow-hidden">
                    <span className="min-w-0 flex-1 overflow-hidden flex justify-end">
                      {onCompanyNameClick && property.sellerId ? (
                        <button
                          onClick={() => {
                            onCompanyNameClick(
                              property.sellerCompanyName || property.sellerName || "",
                              property.sellerId || undefined,
                              true
                            );
                            onClose();
                          }}
                          className="truncate text-primary hover:underline text-right min-w-0"
                          data-testid="text-seller-company-name"
                        >
                          {property.sellerCompanyName || property.sellerName || "—"}
                        </button>
                      ) : (
                        <p className="truncate text-primary text-right min-w-0 m-0" data-testid="text-seller-company-name">
                          {property.sellerCompanyName || property.sellerName || "—"}
                        </p>
                      )}
                    </span>
                    <Building2 className="w-4 h-4 flex-shrink-0 text-primary" />
                  </div>
                  {property.sellerPurchasePrice != null && property.sellerPurchasePrice > 0 && (
                    <div className="text-xs font-medium text-foreground mt-1 space-y-0.5">
                      <span>${Number(property.sellerPurchasePrice).toLocaleString()}</span>
                      {property.sellerPurchaseDate && formattedSellerPurchaseDate && (
                        <div className="text-muted-foreground">{formattedSellerPurchaseDate}</div>
                      )}
                    </div>
                  )}
                  {(property.sellerContactName || property.sellerContactEmail || property.sellerContactPhone) && (
                    <div className="text-sm text-muted-foreground mt-1.5 space-y-1 flex flex-col items-end min-w-0 overflow-hidden w-full">
                      {property.sellerContactName && (
                        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden justify-end w-full" data-testid="text-seller-contact">
                          <span className="truncate min-w-0">{property.sellerContactName}</span>
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                        </div>
                      )}
                      {property.sellerContactEmail && (
                        <a href={`mailto:${property.sellerContactEmail}`} className="flex items-center gap-1.5 text-muted-foreground hover:underline min-w-0 overflow-hidden justify-end w-full">
                          <span className="truncate min-w-0">{property.sellerContactEmail}</span>
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        </a>
                      )}
                      {property.sellerContactPhone && (
                        <a href={`tel:${property.sellerContactPhone.replace(/\D/g, "")}`} className="flex items-center gap-1.5 min-w-0 overflow-hidden text-muted-foreground hover:underline justify-end w-full">
                          <span className="truncate min-w-0">{property.sellerContactPhone}</span>
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {property.spread != null && property.spread !== 0 && (
              <div className="mt-3 flex justify-center items-center gap-1">
                <span className="text-xs text-muted-foreground">Spread</span>
                <span
                  className={`text-sm font-semibold ${isNegative(property.spread) ? "text-spread-negative" : "text-spread-positive"}`}
                  data-testid={`text-spread-${property.id}-modal`}
                >
                  {isNegative(property.spread) ? "-" : ""}${Number(Math.abs(property.spread)).toLocaleString()}
                </span>
              </div>
            )}

            {isAdminOrOwner && (
              <div className="pt-4">
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

