import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CloudUpload, FileText, X, Loader2 } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { InsertProperty } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function UploadDialog({
  open,
  onClose,
  onSuccess,
}: UploadDialogProps) {
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<InsertProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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
    const isCSV = file.name.endsWith('.csv');
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (!isCSV && !isExcel) {
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setFile(file);
    setError(null);

    if (isCSV) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data);
        },
        error: (err) => {
          setError('Error reading CSV file');
          console.error('File read error:', err);
        },
      });
    } else {
      // Handle Excel files
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          processData(jsonData);
        } catch (err) {
          setError('Error reading Excel file. Please make sure it has the correct format.');
          console.error('Excel read error:', err);
        }
      };
      reader.onerror = () => {
        setError('Error reading Excel file');
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Smart field name mapping - recognizes common variations
  const fieldMappings: Record<string, string[]> = {
    address: ['address', 'addr', 'street', 'streetaddress', 'street address', 'property address', 'location'],
    city: ['city', 'town', 'municipality'],
    state: ['state', 'st', 'province'],
    zipCode: ['zipcode', 'zip', 'zip code', 'postalcode', 'postal code', 'postcode'],
    price: ['price', 'salesprice', 'sales price', 'saleprice', 'sale price', 'selling price', 'sellingprice', 'listprice', 'list price', 'amount', 'cost'],
    bedrooms: ['bedrooms', 'beds', 'bed', 'br', 'bedroom', 'numberofbedrooms', 'number of bedrooms'],
    bathrooms: ['bathrooms', 'baths', 'bath', 'ba', 'bathroom', 'numberofbathrooms', 'number of bathrooms'],
    squareFeet: ['squarefeet', 'sqft', 'sq ft', 'square feet', 'squarefootage', 'square footage', 'size', 'area'],
    propertyType: ['propertytype', 'property type', 'type', 'hometype', 'home type', 'dwelling type', 'dwellingtype'],
    imageUrl: ['imageurl', 'image', 'photo', 'picture', 'imagelink', 'image url'],
    latitude: ['latitude', 'lat'],
    longitude: ['longitude', 'lng', 'lon', 'long'],
    description: ['description', 'desc', 'details', 'notes', 'comments'],
    yearBuilt: ['yearbuilt', 'year built', 'built', 'year', 'construction year', 'constructionyear'],
    propertyOwner: ['propertyowner', 'property owner', 'owner', 'company', 'seller', 'vendor'],
    companyContactName: ['companycontactname', 'company contact name', 'contactname', 'contact name', 'contact'],
    companyContactEmail: ['companycontactemail', 'company contact email', 'contactemail', 'contact email', 'email'],
    purchasePrice: ['purchaseprice', 'purchase price', 'bought price', 'boughtprice', 'acquisition price', 'acquisitionprice'],
    dateSold: ['datesold', 'date sold', 'solddate', 'sold date', 'saledate', 'sale date', 'closing date', 'closingdate', 'settlement date', 'settlementdate'],
  };

  // Normalize field name for matching
  const normalizeFieldName = (name: string): string => {
    return name.toLowerCase().replace(/[\s_-]/g, '');
  };

  // Find the value from row using field mapping
  const findFieldValue = (row: any, targetField: string): any => {
    const variations = fieldMappings[targetField] || [targetField];
    
    for (const key of Object.keys(row)) {
      const normalizedKey = normalizeFieldName(key);
      if (variations.some(v => normalizeFieldName(v) === normalizedKey)) {
        return row[key];
      }
    }
    
    return null;
  };

  const processData = (data: any[]) => {
    try {
      if (data.length === 0) {
        setError('The file appears to be empty. Please provide a file with property data.');
        return;
      }

      // Get column names from first row to help with error messages
      const columnNames = data.length > 0 ? Object.keys(data[0]) : [];

      const properties = data
        .map((row: any) => {
          // Helper to safely parse numbers
          const safeParseFloat = (val: any) => {
            if (val === null || val === undefined || val === '') return null;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? null : parsed;
          };
          
          const safeParseInt = (val: any) => {
            if (val === null || val === undefined || val === '') return null;
            const parsed = parseInt(val);
            return isNaN(parsed) ? null : parsed;
          };

          return {
            address: findFieldValue(row, 'address') || '',
            city: findFieldValue(row, 'city') || '',
            state: findFieldValue(row, 'state') || 'CA',
            zipCode: findFieldValue(row, 'zipCode') || '',
            price: safeParseFloat(findFieldValue(row, 'price')) || 0,
            bedrooms: safeParseInt(findFieldValue(row, 'bedrooms')) || 3,
            bathrooms: safeParseFloat(findFieldValue(row, 'bathrooms')) || 2,
            squareFeet: safeParseInt(findFieldValue(row, 'squareFeet')) || 1500,
            propertyType: findFieldValue(row, 'propertyType') || 'Single Family',
            imageUrl: findFieldValue(row, 'imageUrl') || null,
            latitude: safeParseFloat(findFieldValue(row, 'latitude')),
            longitude: safeParseFloat(findFieldValue(row, 'longitude')),
            description: findFieldValue(row, 'description') || null,
            yearBuilt: safeParseInt(findFieldValue(row, 'yearBuilt')),
            propertyOwner: findFieldValue(row, 'propertyOwner') || null,
            companyContactName: findFieldValue(row, 'companyContactName') || null,
            companyContactEmail: findFieldValue(row, 'companyContactEmail') || null,
            purchasePrice: safeParseFloat(findFieldValue(row, 'purchasePrice')),
            dateSold: findFieldValue(row, 'dateSold') || null,
          };
        })
        .filter((prop: any) => {
          // Only require address and price (lat/lng will be geocoded if missing)
          const hasValidPrice = prop.price > 0;
          const hasAddress = prop.address && prop.address.trim() !== '';
          
          return hasValidPrice && hasAddress;
        });
          
      if (properties.length === 0) {
        // Check what's missing to provide helpful error message
        const hasAddressColumn = columnNames.some(col => 
          fieldMappings.address.some(variation => normalizeFieldName(variation) === normalizeFieldName(col))
        );
        const hasPriceColumn = columnNames.some(col => 
          fieldMappings.price.some(variation => normalizeFieldName(variation) === normalizeFieldName(col))
        );
        
        let errorMsg = 'No valid properties found. ';
        if (!hasAddressColumn && !hasPriceColumn) {
          errorMsg += 'Your file is missing both "address" and "price" columns. ';
        } else if (!hasAddressColumn) {
          errorMsg += 'Could not find an address column. Try using "address", "street address", or similar. ';
        } else if (!hasPriceColumn) {
          errorMsg += 'Could not find a price column. Try using "price", "sales price", "sale price", or similar. ';
        } else {
          errorMsg += 'The address or price values appear to be invalid or empty. ';
        }
        errorMsg += `\n\nYour file has these columns: ${columnNames.join(', ')}`;
        
        setError(errorMsg);
        return;
      }
          
      setParsedData(properties as InsertProperty[]);
    } catch (err) {
      setError('Error parsing file. Please check the format.');
      console.error('Parse error:', err);
    }
  };

  const handleUpload = async () => {
    if (parsedData) {
      setIsUploading(true);
      setError(null);
      
      try {
        const response = await apiRequest("POST", "/api/properties/upload", parsedData) as any;
        
        // Show warning toast if some addresses couldn't be geocoded
        if (response.warnings) {
          toast({
            title: "Upload Complete with Warnings",
            description: response.warnings.message,
            variant: "default",
          });
        } else {
          toast({
            title: "Upload Successful",
            description: `Successfully uploaded ${response.count} propert${response.count === 1 ? 'y' : 'ies'}`,
          });
        }
        
        onSuccess?.();
        handleClose();
      } catch (err: any) {
        setError(err.message || "Failed to upload properties");
        console.error("Upload error:", err);
      } finally {
        setIsUploading(false);
      }
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
                Drag and drop your CSV or Excel file here, or{" "}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary hover:underline"
                  data-testid="button-browse"
                >
                  browse
                </button>
              </p>
              <p className="text-sm text-muted-foreground">
                CSV or Excel file (.csv, .xlsx, .xls) with columns: address, city, state, zipCode, price, bedrooms, bathrooms, squareFeet, propertyType, propertyOwner (optional: latitude, longitude, companyContactName, companyContactEmail, purchasePrice, dateSold)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
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
              <Button 
                variant="outline" 
                onClick={handleClose} 
                className="flex-1" 
                disabled={isUploading}
                data-testid="button-cancel-upload"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                className="flex-1" 
                disabled={isUploading}
                data-testid="button-confirm-upload"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  `Upload ${parsedData.length} Properties`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
