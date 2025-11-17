import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CloudUpload, FileText, X } from "lucide-react";
import Papa from "papaparse";
import { InsertProperty } from "@shared/schema";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUpload?: (properties: InsertProperty[]) => void;
}

export default function UploadDialog({
  open,
  onClose,
  onUpload,
}: UploadDialogProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<InsertProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setFile(file);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const properties = results.data
            .map((row: any) => ({
              address: row.address || row.Address,
              city: row.city || row.City,
              state: row.state || row.State,
              zipCode: row.zipCode || row.ZipCode || row.zip_code || row.Zip,
              price: parseFloat(row.price || row.Price),
              bedrooms: parseInt(row.bedrooms || row.Bedrooms || row.beds),
              bathrooms: parseFloat(row.bathrooms || row.Bathrooms || row.baths),
              squareFeet: parseInt(row.squareFeet || row.SquareFeet || row.sqft || row.square_feet),
              propertyType: row.propertyType || row.PropertyType || row.type || 'Single Family',
              imageUrl: row.imageUrl || row.ImageUrl || row.image || null,
              latitude: parseFloat(row.latitude || row.Latitude || row.lat),
              longitude: parseFloat(row.longitude || row.Longitude || row.lng || row.lon),
              description: row.description || row.Description || null,
              yearBuilt: row.yearBuilt || row.YearBuilt || row.year_built ? parseInt(row.yearBuilt || row.YearBuilt || row.year_built) : null,
              propertyOwner: row.propertyOwner || row.PropertyOwner || row.property_owner || null,
              companyContactName: row.companyContactName || row.CompanyContactName || row.company_contact_name || row.contactName || null,
              companyContactEmail: row.companyContactEmail || row.CompanyContactEmail || row.company_contact_email || row.contactEmail || null,
              purchasePrice: row.purchasePrice || row.PurchasePrice || row.purchase_price ? parseFloat(row.purchasePrice || row.PurchasePrice || row.purchase_price) : null,
              dateSold: row.dateSold || row.DateSold || row.date_sold || null,
            }))
            .filter((prop: any) => {
              // Validate required fields
              const hasValidCoordinates = !isNaN(prop.latitude) && !isNaN(prop.longitude);
              const hasValidPrice = !isNaN(prop.price);
              const hasAddress = prop.address && prop.address.trim() !== '';
              
              return hasValidCoordinates && hasValidPrice && hasAddress;
            });
          
          if (properties.length === 0) {
            setError('No valid properties found. Please ensure your CSV has address, price, latitude, and longitude columns.');
            return;
          }
          
          setParsedData(properties);
        } catch (err) {
          setError('Error parsing CSV file. Please check the format.');
          console.error('Parse error:', err);
        }
      },
      error: (err) => {
        setError('Error reading CSV file');
        console.error('File read error:', err);
      },
    });
  };

  const handleUpload = () => {
    if (parsedData) {
      onUpload?.(parsedData);
      console.log('Uploading properties:', parsedData);
      handleClose();
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData(null);
    setError(null);
    setDragActive(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="dialog-upload">
        <DialogHeader>
          <DialogTitle>Upload Property Data</DialogTitle>
        </DialogHeader>

        {!parsedData ? (
          <div>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              data-testid="dropzone-upload"
            >
              <CloudUpload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-base mb-2">
                Drag and drop your CSV file here, or{" "}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary hover:underline"
                  data-testid="button-browse"
                >
                  browse
                </button>
              </p>
              <p className="text-sm text-muted-foreground">
                CSV file with columns: address, city, state, zipCode, price, bedrooms, bathrooms, squareFeet, propertyType, latitude, longitude, propertyOwner, companyContactName, companyContactEmail, purchasePrice, dateSold
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
                data-testid="input-file"
              />
            </div>

            {file && !error && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm flex-1">{file.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setFile(null);
                    setParsedData(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="bg-muted rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-2">Preview</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Found {parsedData.length} properties
              </p>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="text-left py-2">Address</th>
                      <th className="text-left py-2">Price</th>
                      <th className="text-left py-2">Beds</th>
                      <th className="text-left py-2">Baths</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 5).map((prop, idx) => (
                      <tr key={idx} className="border-b border-border">
                        <td className="py-2">{prop.address}</td>
                        <td className="py-2">${prop.price.toLocaleString()}</td>
                        <td className="py-2">{prop.bedrooms}</td>
                        <td className="py-2">{prop.bathrooms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 5 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    And {parsedData.length - 5} more...
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1" data-testid="button-cancel-upload">
                Cancel
              </Button>
              <Button onClick={handleUpload} className="flex-1" data-testid="button-confirm-upload">
                Upload {parsedData.length} Properties
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
