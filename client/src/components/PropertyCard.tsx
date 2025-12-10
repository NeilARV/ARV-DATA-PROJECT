import { Property } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Bed, Bath, Maximize2, Building2, Calendar } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { format, parseISO, isValid } from "date-fns";

interface PropertyCardProps {
  property: Property;
  onClick?: () => void;
}

export default function PropertyCard({ property, onClick }: PropertyCardProps) {
  const [imageUrl, setImageUrl] = useState(property.imageUrl || "");

  useEffect(() => {
    // If no custom image URL, fetch Street View image
    if (!property.imageUrl) {
      getStreetViewUrl(
        property.address,
        property.city,
        property.state,
        "400x300",
      ).then((url) => {
        if (url) {
          setImageUrl(url);
        }
      });
    }
  }, [property.address, property.city, property.state, property.imageUrl]);

  return (
    <Card
      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-shadow"
      onClick={onClick}
      data-testid={`card-property-${property.id}`}
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={property.address}
            className="w-full h-full object-cover"
            data-testid={`img-property-${property.id}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No image available
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <div
            className="text-xl font-bold text-foreground"
            data-testid={`text-price-${property.id}`}
          >
            ${property.price.toLocaleString()}
          </div>
          {property.dateSold && (
            <div
              className="flex flex-col items-end text-sm"
              data-testid={`text-date-sold-${property.id}`}
            >
              <span className="text-sm font-semibold text-muted-foreground">
                Purchased Date
              </span>
              <div className="flex items-center gap-1 text-foreground">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span>
                  {(() => {
                    try {
                      const date = parseISO(property.dateSold);
                      return isValid(date)
                        ? format(date, "MMM d, yyyy")
                        : property.dateSold;
                    } catch {
                      return property.dateSold;
                    }
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
        <div
          className="text-base font-medium text-foreground mb-3"
          data-testid={`text-address-${property.id}`}
        >
          {property.address}
        </div>
        <div className="text-sm text-muted-foreground mb-2">
          {property.city}, {property.state} {property.zipCode}
        </div>
        <div className="flex items-center gap-4 text-sm text-foreground">
          <div
            className="flex items-center gap-1"
            data-testid={`text-beds-${property.id}`}
          >
            <Bed className="w-4 h-4 text-muted-foreground" />
            <span>{property.bedrooms} bd</span>
          </div>
          <div
            className="flex items-center gap-1"
            data-testid={`text-baths-${property.id}`}
          >
            <Bath className="w-4 h-4 text-muted-foreground" />
            <span>{property.bathrooms} ba</span>
          </div>
          <div
            className="flex items-center gap-1"
            data-testid={`text-sqft-${property.id}`}
          >
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
            <span>{property.squareFeet.toLocaleString()} sqft</span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          {property.propertyType}
        </div>
        {property.propertyOwner && (
          <div className="flex items-start gap-2 mt-3 pt-3 border-t">
            <Building2 className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Owner</div>
              <div
                className="font-semibold text-base text-primary"
                data-testid={`text-owner-${property.id}`}
              >
                {property.propertyOwner}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
