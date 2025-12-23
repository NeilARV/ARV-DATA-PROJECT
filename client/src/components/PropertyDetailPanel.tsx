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
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const { toast } = useToast();

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
          <div>
            <p className="text-xs text-muted-foreground mb-1">Purchase Price</p>
            <div className="text-2xl font-bold" data-testid="text-panel-price">
              ${property.price.toLocaleString()}
            </div>
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
                <div className="font-medium text-sm mb-2" data-testid="text-company-contact">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground mb-1">Purchased Date</div>
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
              <Label htmlFor="request-name-panel">Name</Label>
              <Input
                id="request-name-panel"
                placeholder="Your name"
                value={requestName}
                onChange={(e) => setRequestName(e.target.value)}
                data-testid="input-request-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="request-email-panel">Email</Label>
              <Input
                id="request-email-panel"
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
    </div>
  );
}
