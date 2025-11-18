import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Bed, Bath, Maximize2, MapPin, X, Calendar, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { formatDate, calculateDaysOwned } from "@/lib/dateUtils";

interface PropertyDetailPanelProps {
  property: Property | null;
  onClose: () => void;
}

export default function PropertyDetailPanel({
  property,
  onClose,
}: PropertyDetailPanelProps) {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (property) {
      if (property.imageUrl) {
        setImageUrl(property.imageUrl);
      } else {
        getStreetViewUrl(property.address, property.city, property.state, "400x300")
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
    <div className="w-96 h-full bg-background border-r border-border overflow-y-auto" data-testid="panel-property-detail">
      <div className="sticky top-0 z-10 bg-background border-b border-border p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Property Details</h2>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-panel">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={property.address}
              className="w-full h-full object-cover"
              data-testid="img-property-panel"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading...
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-2xl font-bold" data-testid="text-panel-price">
            ${property.price.toLocaleString()}
          </div>

          <div>
            <div className="text-base font-medium">{property.address}</div>
            <div className="text-sm text-muted-foreground">
              {property.city}, {property.state} {property.zipCode}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <Bed className="w-4 h-4" />
              <span data-testid="text-panel-beds">{property.bedrooms} bd</span>
            </div>
            <div className="flex items-center gap-1">
              <Bath className="w-4 h-4" />
              <span data-testid="text-panel-baths">{property.bathrooms} ba</span>
            </div>
            <div className="flex items-center gap-1">
              <Maximize2 className="w-4 h-4" />
              <span data-testid="text-panel-sqft">{property.squareFeet.toLocaleString()} sqft</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Property Type</div>
                <div className="font-medium text-sm">{property.propertyType}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Price per Sqft</div>
                <div className="font-medium text-sm">${pricePerSqft}</div>
              </div>
            </div>

            {property.propertyOwner && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Property Owner</div>
                <div className="flex items-start gap-1">
                  <Building2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span className="font-medium text-sm" data-testid="text-property-owner">{property.propertyOwner}</span>
                </div>
              </div>
            )}

            {property.companyContactName && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Company Contact</div>
                <div className="font-medium text-sm" data-testid="text-company-contact">
                  {property.companyContactName}
                </div>
              </div>
            )}

            {formattedDateSold && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Date Sold</div>
                  <div className="flex items-start gap-1">
                    <Calendar className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span className="font-medium text-sm">{formattedDateSold}</span>
                  </div>
                </div>

                {daysOwned !== null && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Days Owned</div>
                    <div className="font-medium text-sm">{daysOwned} days</div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="text-xs text-muted-foreground mb-1">Location</div>
              <div className="flex items-start gap-1 text-sm">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  <div>{property.address}</div>
                  <div className="text-muted-foreground">{property.city}, {property.state} {property.zipCode}</div>
                  {property.latitude !== null && property.longitude !== null && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Coordinates: {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
