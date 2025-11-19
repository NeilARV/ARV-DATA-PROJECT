import { Property } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bed, Bath, Maximize2, MapPin, Building2, Calendar } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { formatDate, calculateDaysOwned } from "@/lib/dateUtils";

interface PropertyDetailModalProps {
  property: Property | null;
  open: boolean;
  onClose: () => void;
}

export default function PropertyDetailModal({
  property,
  open,
  onClose,
}: PropertyDetailModalProps) {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (property) {
      if (property.imageUrl) {
        setImageUrl(property.imageUrl);
      } else {
        getStreetViewUrl(property.address, property.city, property.state, "800x450")
          .then(url => {
            if (url) {
              setImageUrl(url);
            }
          });
      }
    }
  }, [property]);

  if (!property) return null;

  const pricePerSqft = Math.round(property.price / property.squareFeet);
  const formattedDateSold = formatDate(property.dateSold);
  const daysOwned = calculateDaysOwned(property.dateSold);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="modal-property-detail">
        <div className="space-y-4">
          <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={property.address}
                className="w-full h-full object-cover"
                data-testid="img-property-detail"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Loading Street View...
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-3xl font-bold" data-testid="text-detail-price">
              ${property.price.toLocaleString()}
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
                    <span className="font-medium" data-testid="text-property-owner">{property.propertyOwner}</span>
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
                    data-testid="button-request-contact"
                  >
                    Request Contact
                  </Button>
                </div>
              )}

              {formattedDateSold && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Date Sold</div>
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
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
