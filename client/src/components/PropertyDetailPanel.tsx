import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Bed, Bath, Maximize2, MapPin, X, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PropertyDetailPanelProps {
  property: Property | null;
  onClose: () => void;
}

export default function PropertyDetailPanel({
  property,
  onClose,
}: PropertyDetailPanelProps) {
  if (!property) return null;

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
          <img
            src={property.imageUrl || ''}
            alt={property.address}
            className="w-full h-full object-cover"
            data-testid="img-property-panel"
          />
        </div>

        <div>
          <div className="text-2xl font-bold text-foreground mb-2" data-testid="text-panel-price">
            ${property.price.toLocaleString()}
          </div>
          
          <div className="text-base font-medium text-foreground mb-1">
            {property.address}
          </div>

          <div className="flex items-center gap-1 text-muted-foreground text-sm">
            <MapPin className="w-4 h-4" />
            <span>
              {property.city}, {property.state} {property.zipCode}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Bed className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="font-semibold" data-testid="text-panel-beds">{property.bedrooms}</div>
              <div className="text-xs text-muted-foreground">Bedrooms</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Bath className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="font-semibold" data-testid="text-panel-baths">{property.bathrooms}</div>
              <div className="text-xs text-muted-foreground">Bathrooms</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Maximize2 className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="font-semibold" data-testid="text-panel-sqft">{property.squareFeet.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Sqft</div>
            </div>
          </div>
          {property.yearBuilt && (
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="font-semibold">{property.yearBuilt}</div>
                <div className="text-xs text-muted-foreground">Year Built</div>
              </div>
            </div>
          )}
        </div>

        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground text-sm">Property Type</span>
              <span className="font-medium text-sm">{property.propertyType}</span>
            </div>
            {property.propertyOwner && (
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground text-sm">Property Owner</span>
                <span className="font-medium text-sm">{property.propertyOwner}</span>
              </div>
            )}
            {property.companyContactName && (
              <div className="py-2 border-b border-border">
                <div className="text-muted-foreground text-sm mb-1">Company Contact</div>
                <div className="font-medium text-sm">{property.companyContactName}</div>
                {property.companyContactEmail && (
                  <div className="text-sm text-muted-foreground">{property.companyContactEmail}</div>
                )}
              </div>
            )}
            {property.purchasePrice && (
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground text-sm">Purchase Price</span>
                <span className="font-medium text-sm">${property.purchasePrice.toLocaleString()}</span>
              </div>
            )}
            {property.dateSold && (
              <>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground text-sm">Date Sold</span>
                  <span className="font-medium text-sm">
                    {(() => {
                      const date = new Date(property.dateSold);
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const year = date.getFullYear();
                      return `${month}-${day}-${year}`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground text-sm">Days Owned</span>
                  <span className="font-medium text-sm">
                    {(() => {
                      const soldDate = new Date(property.dateSold);
                      const today = new Date();
                      const diffTime = Math.abs(today.getTime() - soldDate.getTime());
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      return diffDays;
                    })()}
                  </span>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
