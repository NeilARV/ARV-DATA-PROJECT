import { Property } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bed, Bath, Maximize2, MapPin, Calendar } from "lucide-react";

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
  if (!property) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="modal-property-detail">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            {property.address}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
            <img
              src={property.imageUrl || ''}
              alt={property.address}
              className="w-full h-full object-cover"
              data-testid="img-property-detail"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-bold text-foreground mb-2" data-testid="text-detail-price">
                ${property.price.toLocaleString()}
              </div>
              
              <div className="flex items-center gap-1 text-muted-foreground mb-4">
                <MapPin className="w-4 h-4" />
                <span className="text-sm">
                  {property.city}, {property.state} {property.zipCode}
                </span>
              </div>

              <div className="flex flex-wrap gap-6 mb-6">
                <div className="flex items-center gap-2">
                  <Bed className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="font-semibold" data-testid="text-detail-beds">{property.bedrooms}</div>
                    <div className="text-xs text-muted-foreground">Bedrooms</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Bath className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="font-semibold" data-testid="text-detail-baths">{property.bathrooms}</div>
                    <div className="text-xs text-muted-foreground">Bathrooms</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="font-semibold" data-testid="text-detail-sqft">{property.squareFeet.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Sqft</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Property Type</span>
                  <span className="font-medium">{property.propertyType}</span>
                </div>
                {property.yearBuilt && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Year Built</span>
                    <span className="font-medium">{property.yearBuilt}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Price per Sqft</span>
                  <span className="font-medium">
                    ${Math.round(property.price / property.squareFeet).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">Description</h3>
              <p className="text-muted-foreground leading-relaxed">
                {property.description || 
                  `Beautiful ${property.propertyType.toLowerCase()} located in ${property.city}, ${property.state}. This property features ${property.bedrooms} bedrooms and ${property.bathrooms} bathrooms with ${property.squareFeet.toLocaleString()} square feet of living space.`
                }
              </p>

              <div className="mt-6">
                <h3 className="font-semibold text-lg mb-3">Location</h3>
                <div className="text-sm text-muted-foreground">
                  <div>{property.address}</div>
                  <div>{property.city}, {property.state} {property.zipCode}</div>
                  <div className="mt-2 text-xs">
                    Coordinates: {property.latitude.toFixed(4)}, {property.longitude.toFixed(4)}
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
