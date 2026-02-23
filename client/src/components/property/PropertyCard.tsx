import type { Property } from "@/types/property";
import { Card } from "@/components/ui/card";
import { Bed, Bath, Maximize2, Building2, Calendar, Phone, User, Mail } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { format, parseISO, isValid } from "date-fns";
import { StatusTag } from "./StatusTag";
import { formatAddress } from "@shared/utils/formatAddress";

interface PropertyCardProps {
  property: Property;
  onClick?: () => void;
}

export default function PropertyCard({ property, onClick }: PropertyCardProps) {
  const [imageUrl, setImageUrl] = useState(property.imageUrl || "");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // If no custom image URL, fetch Street View image
    if (!property.imageUrl) {
      setIsLoading(true);
      getStreetViewUrl(
        property.address,
        property.city,
        property.state,
        "400x300",
        property.id
      ).then((url) => {
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
      }).catch(() => {
        // If URL generation fails or fetch fails, show "No image available" text
        setImageUrl("");
        setIsLoading(false);
      });
    }
  }, [property.address, property.city, property.state, property.imageUrl, property.id]);

  return (
    <Card
      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-shadow"
      onClick={onClick}
      data-testid={`card-property-${property.id}`}
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted relative">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : imageUrl ? (
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
        <div className="absolute top-2 right-2 flex gap-2 items-end">
          <StatusTag status={property.status} section={"card"}/>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-sm text-muted-foreground">
              {property.status?.toLowerCase().trim() === "sold" ? "Sold Price" : "Purchase Price"}
            </p>
            <div
              className="text-xl font-bold text-foreground"
              data-testid={`text-price-${property.id}`}
            >
              {`$${property.price.toLocaleString()}`}
            </div>
          </div>

          <div className="flex items-start gap-6 text-sm">
            <div className="flex flex-col items-end" data-testid={`text-date-sold-${property.id}`}>
              <span className="text-sm text-muted-foreground mb-1">Date Sold</span>
              <div className="flex items-center gap-1 font-semibold text-foreground">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span>
                  {(() => {
                    try {
                      if (!property.dateSold) return <span className="text-muted-foreground">—</span>;
                      const date = parseISO(property.dateSold);
                      return isValid(date) ? format(date, "MMM d, yyyy") : property.dateSold;
                    } catch {
                      return property.dateSold ?? <span className="text-muted-foreground">—</span>;
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div
          className="text-base font-medium text-foreground"
          data-testid={`text-address-${property.id}`}
        >
          {formatAddress(property.address)}
        </div>
        <div className="text-sm text-muted-foreground mb-2">
          {formatAddress(property.city)}, {property.state} {property.zipCode}
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
        {(property.buyerId || property.sellerId) && (
          <div className={`mt-3 pt-3 border-t grid gap-4 items-stretch ${property.buyerId && property.sellerId ? "grid-cols-2" : "grid-cols-1"}`}>
            {property.buyerId && (
              <div className="min-w-0 flex flex-col">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Buyer</div>
                  <div
                    className="flex items-center gap-1.5 font-semibold text-sm text-foreground mt-0.5"
                    data-testid={`text-buyer-${property.id}`}
                  >
                    <Building2 className="w-4 h-4 flex-shrink-0 text-primary" />
                    <span className="truncate text-primary">
                      {property.buyerCompanyName || property.companyName || property.propertyOwner || "—"}
                    </span>
                  </div>
                  {(property.buyerContactName || property.buyerContactEmail || property.buyerContactPhone) && (
                    <div className="text-sm text-muted-foreground mt-1.5 space-y-1">
                      {property.buyerContactName && (
                        <div
                          className="flex items-center gap-1.5 truncate"
                          data-testid={`text-buyer-contact-${property.id}`}
                        >
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{property.buyerContactName}</span>
                        </div>
                      )}
                      {property.buyerContactEmail && (
                        <a
                          href={`mailto:${property.buyerContactEmail}`}
                          className="flex items-center gap-1.5 text-muted-foreground hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-buyer-email-${property.id}`}
                        >
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{property.buyerContactEmail}</span>
                        </a>
                      )}
                      {property.buyerContactPhone && (
                        <a
                          href={`tel:${property.buyerContactPhone.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 truncate text-muted-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-buyer-phone-${property.id}`}
                        >
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{property.buyerContactPhone}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {property.sellerId && (
              <div className="min-w-0 flex flex-col">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Seller</div>
                  <div
                    className="flex items-center gap-1.5 font-semibold text-sm text-foreground mt-0.5"
                    data-testid={`text-seller-${property.id}`}
                  >
                    <Building2 className="w-4 h-4 flex-shrink-0 text-primary" />
                    <span className="truncate text-primary">
                      {property.sellerCompanyName || "—"}
                    </span>
                  </div>
                  {(property.sellerContactName ||
                    property.sellerContactEmail ||
                    property.sellerContactPhone) && (
                    <div className="text-sm text-muted-foreground mt-1.5 space-y-1">
                      {property.sellerContactName && (
                        <div
                          className="flex items-center gap-1.5 truncate"
                          data-testid={`text-seller-contact-${property.id}`}
                        >
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{property.sellerContactName}</span>
                        </div>
                      )}
                      {property.sellerContactEmail && (
                        <a
                          href={`mailto:${property.sellerContactEmail}`}
                          className="flex items-center gap-1.5 text-muted-foreground hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-seller-email-${property.id}`}
                        >
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{property.sellerContactEmail}</span>
                        </a>
                      )}
                      {property.sellerContactPhone && (
                        <a
                          href={`tel:${property.sellerContactPhone.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 truncate text-muted-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-seller-phone-${property.id}`}
                        >
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{property.sellerContactPhone}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
