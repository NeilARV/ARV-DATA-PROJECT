import type { Property } from "@/types/property";
import { Card } from "@/components/ui/card";
import { Bed, Bath, Maximize2, Building2, Calendar, Phone, User, Mail } from "lucide-react";
import { useState, useEffect } from "react";
import { getStreetViewUrl } from "@/lib/streetView";
import { format, parseISO, isValid } from "date-fns";
import { StatusTag } from "./StatusTag";
import { formatAddress } from "@shared/utils/formatAddress";
import { isNegative } from "@/utils/isNegative";

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
              <span className="text-sm text-muted-foreground mb-1">
                {["wholesale", "in-renovation"].includes((property.status || "").toLowerCase().trim())
                  ? "Date Purchased"
                  : "Date Sold"}
              </span>
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
        <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-4 items-stretch">
            {/* Buyer: left column; truncate only when name actually overflows */}
            <div className="min-w-0 flex flex-col items-start text-left overflow-hidden">
                <div className="min-w-0 flex-1 w-full overflow-hidden">
                  <div className="text-xs text-muted-foreground">Buyer</div>
                  <div
                    className="flex items-center gap-1.5 font-semibold text-sm text-foreground mt-0.5 min-w-0 overflow-hidden w-full"
                    data-testid={`text-buyer-${property.id}`}
                  >
                    <Building2 className="w-4 h-4 flex-shrink-0 text-primary" />
                    <span className="truncate text-primary min-w-0">
                      {property.buyerCompanyName || property.companyName || property.propertyOwner || "—"}
                    </span>
                  </div>
                  {(property.buyerPurchasePrice != null && property.buyerPurchasePrice > 0) && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <span className="font-medium text-foreground">${Number(property.buyerPurchasePrice).toLocaleString()}</span>
                      {property.buyerPurchaseDate && (() => {
                        try {
                          const d = parseISO(property.buyerPurchaseDate);
                          return isValid(d) ? <div className="text-muted-foreground">{format(d, "MMM d, yyyy")}</div> : null;
                        } catch { return null; }
                      })()}
                    </div>
                  )}
                  {(property.buyerContactName || property.buyerContactEmail || property.buyerContactPhone) && (
                    <div className="text-sm text-muted-foreground mt-1.5 space-y-1 min-w-0 overflow-hidden w-full">
                      {property.buyerContactName && (
                        <div
                          className="flex items-center gap-1.5 min-w-0 overflow-hidden"
                          data-testid={`text-buyer-contact-${property.id}`}
                        >
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{property.buyerContactName}</span>
                        </div>
                      )}
                      {property.buyerContactEmail && (
                        <a
                          href={`mailto:${property.buyerContactEmail}`}
                          className="flex items-center gap-1.5 text-muted-foreground hover:underline min-w-0 overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-buyer-email-${property.id}`}
                        >
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{property.buyerContactEmail}</span>
                        </a>
                      )}
                      {property.buyerContactPhone && (
                        <a
                          href={`tel:${property.buyerContactPhone.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 min-w-0 overflow-hidden text-muted-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-buyer-phone-${property.id}`}
                        >
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{property.buyerContactPhone}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            {/* Seller: right column, aligned right; ellipsis at end when truncated */}
            <div className="min-w-0 flex flex-col items-end text-right overflow-hidden">
                <div className="min-w-0 flex-1 w-full flex flex-col items-end overflow-hidden">
                  <div className="text-xs text-muted-foreground w-full text-right">Seller</div>
                  <div
                    className="flex items-center justify-end gap-1.5 font-semibold text-sm text-foreground mt-0.5 min-w-0 w-full overflow-hidden"
                    data-testid={`text-seller-${property.id}`}
                  >
                    <span className="min-w-0 flex-1 overflow-hidden flex justify-end">
                      <span className="truncate text-primary min-w-0 text-right" title={property.sellerCompanyName || property.sellerName || "—"}>
                        {property.sellerCompanyName || property.sellerName || "—"}
                      </span>
                    </span>
                    <Building2 className="w-4 h-4 flex-shrink-0 text-primary" />
                  </div>
                  {(property.sellerPurchasePrice != null && property.sellerPurchasePrice > 0) && (
                    <div className="text-xs font-medium text-foreground mt-1 space-y-0.5">
                      <span>${Number(property.sellerPurchasePrice).toLocaleString()}</span>
                      {property.sellerPurchaseDate && (() => {
                        try {
                          const d = parseISO(property.sellerPurchaseDate);
                          return isValid(d) ? <div className="text-muted-foreground text-xs">{format(d, "MMM d, yyyy")}</div> : null;
                        } catch { return null; }
                      })()}
                    </div>
                  )}
                  {(property.sellerContactName ||
                    property.sellerContactEmail ||
                    property.sellerContactPhone) && (
                    <div className="text-sm text-muted-foreground mt-1.5 space-y-1 flex flex-col items-end min-w-0 overflow-hidden w-full">
                      {property.sellerContactName && (
                        <div
                          className="flex items-center gap-1.5 min-w-0 overflow-hidden justify-end w-full"
                          data-testid={`text-seller-contact-${property.id}`}
                        >
                          <span className="truncate min-w-0">{property.sellerContactName}</span>
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                        </div>
                      )}
                      {property.sellerContactEmail && (
                        <a
                          href={`mailto:${property.sellerContactEmail}`}
                          className="flex items-center gap-1.5 text-muted-foreground hover:underline min-w-0 overflow-hidden justify-end w-full"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-seller-email-${property.id}`}
                        >
                          <span className="truncate min-w-0">{property.sellerContactEmail}</span>
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        </a>
                      )}
                      {property.sellerContactPhone && (
                        <a
                          href={`tel:${property.sellerContactPhone.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 min-w-0 overflow-hidden text-muted-foreground hover:underline justify-end w-full"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`text-seller-phone-${property.id}`}
                        >
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
            <span
              className={`text-sm font-semibold ${isNegative(property.spread) ? "text-spread-negative" : "text-spread-positive"}`}
              data-testid={`text-spread-${property.id}`}
            >
              {isNegative(property.spread) ? "-" : "+"}${Number(Math.abs(property.spread)).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
