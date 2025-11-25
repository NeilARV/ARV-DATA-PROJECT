import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CloudUpload, FileText, X, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { InsertProperty, insertPropertySchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parseDate } from "@/lib/dateUtils";

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
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form for manual entry - Derived from insertPropertySchema with numeric fields accepting undefined during editing
  const manualEntrySchema = insertPropertySchema.extend({
    // Allow numeric fields to be undefined during editing (will be converted to 0 on submit)
    price: insertPropertySchema.shape.price.or(z.undefined()),
    bedrooms: insertPropertySchema.shape.bedrooms.or(z.undefined()),
    bathrooms: insertPropertySchema.shape.bathrooms.or(z.undefined()),
    squareFeet: insertPropertySchema.shape.squareFeet.or(z.undefined()),
    // Make optional fields that can be left blank
    latitude: insertPropertySchema.shape.latitude.optional(),
    longitude: insertPropertySchema.shape.longitude.optional(),
    imageUrl: insertPropertySchema.shape.imageUrl.optional(),
    description: insertPropertySchema.shape.description.optional(),
    yearBuilt: insertPropertySchema.shape.yearBuilt.optional(),
    propertyOwner: insertPropertySchema.shape.propertyOwner.optional(),
    companyContactName: insertPropertySchema.shape.companyContactName.optional(),
    companyContactEmail: insertPropertySchema.shape.companyContactEmail.optional(),
    purchasePrice: insertPropertySchema.shape.purchasePrice.optional(),
    dateSold: insertPropertySchema.shape.dateSold.optional(),
  });

  const form = useForm<z.infer<typeof manualEntrySchema>>({
    resolver: zodResolver(manualEntrySchema),
    defaultValues: {
      address: "",
      city: "",
      state: "",
      zipCode: "",
      price: undefined,
      bedrooms: undefined,
      bathrooms: undefined,
      squareFeet: undefined,
      propertyType: "Single Family",
      imageUrl: "",
      description: "",
      yearBuilt: undefined,
      propertyOwner: "",
      companyContactName: "",
      companyContactEmail: "",
      purchasePrice: undefined,
      dateSold: "",
    },
  });

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
          
          // Get range to find actual data
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
          
          // Try to find the header row by looking for rows with actual data
          let headerRowIndex = 0;
          let jsonData: any[] = [];
          
          for (let rowIndex = range.s.r; rowIndex <= Math.min(range.s.r + 10, range.e.r); rowIndex++) {
            const testData = XLSX.utils.sheet_to_json(worksheet, { 
              range: rowIndex,
              defval: '' 
            });
            
            if (testData.length > 0) {
              const firstRow = testData[0] as any;
              const keys = Object.keys(firstRow);
              
              // Check if this row has meaningful column names (not just __EMPTY)
              const hasRealHeaders = keys.some(key => 
                !key.startsWith('__EMPTY') && 
                key.trim() !== '' &&
                typeof firstRow[key] === 'string' &&
                firstRow[key].trim() !== ''
              );
              
              if (hasRealHeaders) {
                headerRowIndex = rowIndex;
                jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                  range: rowIndex,
                  defval: ''
                });
                break;
              }
            }
          }
          
          // If no header row found, try with default parsing but filter out __EMPTY columns
          if (jsonData.length === 0) {
            const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            jsonData = rawData.map((row: any) => {
              const cleanedRow: any = {};
              Object.keys(row).forEach(key => {
                if (!key.startsWith('__EMPTY')) {
                  cleanedRow[key] = row[key];
                }
              });
              return cleanedRow;
            });
          }
          
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
    propertyOwner: ['propertyowner', 'property owner', 'owner', 'ownername', 'owner name', 'company', 'companyname', 'company name', 'seller', 'vendor', 'sellername', 'seller name'],
    companyContactName: ['companycontactname', 'company contact name', 'contactname', 'contact name', 'contact', 'contactperson', 'contact person', 'representative', 'rep'],
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
            dateSold: (() => {
              const dateValue = findFieldValue(row, 'dateSold');
              if (!dateValue) return null;
              const parsedDate = parseDate(dateValue);
              return parsedDate ? parsedDate.toISOString() : null;
            })(),
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
        let totalUploaded = 0;
        let allWarnings: string[] = [];
        const BATCH_SIZE = 10; // Upload 10 properties per request for production reliability
        
        // Split into smaller batches and upload each one
        for (let i = 0; i < parsedData.length; i += BATCH_SIZE) {
          const batch = parsedData.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(parsedData.length / BATCH_SIZE);
          
          setUploadStatus(`Uploading batch ${batchNum}/${totalBatches} (${batch.length} properties)...`);
          
          const response = await apiRequest("POST", "/api/properties/upload", batch, 15 * 60 * 1000) as any;
          
          totalUploaded += response.count || 0;
          
          if (response.warnings?.failedAddresses) {
            allWarnings.push(...response.warnings.failedAddresses);
          }
        }
        
        // Check if NO properties were uploaded (complete failure)
        if (totalUploaded === 0) {
          const errorMsg = allWarnings.length > 0
            ? `Failed to geocode addresses: ${allWarnings.slice(0, 3).join(', ')}${allWarnings.length > 3 ? '...' : ''}`
            : "No properties were uploaded. Please check your data and try again.";
          
          setError(errorMsg);
          toast({
            title: "Upload Failed",
            description: errorMsg,
            variant: "destructive",
          });
          return;
        }
        
        // Some or all properties uploaded successfully
        if (allWarnings.length > 0) {
          toast({
            title: "Upload Complete with Warnings",
            description: `Uploaded ${totalUploaded} propert${totalUploaded === 1 ? 'y' : 'ies'} but failed to geocode ${allWarnings.length} address${allWarnings.length === 1 ? '' : 'es'}`,
            variant: "default",
          });
        } else {
          toast({
            title: "Upload Successful",
            description: `Successfully uploaded ${totalUploaded} propert${totalUploaded === 1 ? 'y' : 'ies'}`,
          });
        }
        
        onSuccess?.();
        handleClose();
      } catch (err: any) {
        const errorMsg = err.message || "Failed to upload properties";
        setError(errorMsg);
        console.error("Upload error:", err);
        toast({
          title: "Upload Failed",
          description: errorMsg,
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
        setUploadStatus("");
      }
    }
  };

  const handleManualSubmit = async (data: z.infer<typeof manualEntrySchema>) => {
    setIsManualSubmitting(true);
    setError(null);

    try {
      // Validate required numeric fields - don't allow undefined
      if (data.price === undefined || data.price === null) {
        form.setError("price", { message: "Price is required" });
        setIsManualSubmitting(false);
        return;
      }
      if (data.bedrooms === undefined || data.bedrooms === null) {
        form.setError("bedrooms", { message: "Bedrooms is required" });
        setIsManualSubmitting(false);
        return;
      }
      if (data.bathrooms === undefined || data.bathrooms === null) {
        form.setError("bathrooms", { message: "Bathrooms is required" });
        setIsManualSubmitting(false);
        return;
      }
      if (data.squareFeet === undefined || data.squareFeet === null) {
        form.setError("squareFeet", { message: "Square Feet is required" });
        setIsManualSubmitting(false);
        return;
      }

      // All required fields present - create property data
      const propertyData: InsertProperty = {
        ...data,
        price: data.price,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        squareFeet: data.squareFeet,
      };

      await apiRequest("POST", "/api/properties", propertyData);
      
      toast({
        title: "Property Added",
        description: "Property has been successfully added to the database.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      form.reset();
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      const errorMessage = err.message || "Failed to add property";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsManualSubmitting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData(null);
    setError(null);
    setDragActive(false);
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-upload">
        <DialogHeader>
          <DialogTitle>Add Property Data</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="file" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" data-testid="tab-file-upload">File Upload</TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-manual-entry">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4">
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
                    CSV or Excel file (.csv, .xlsx, .xls)
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

                {uploadStatus && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-200 rounded-md text-sm">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    <span>{uploadStatus}</span>
                  </div>
                )}

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
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleManualSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Address *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="123 Main St" data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="San Diego" data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="CA" maxLength={2} data-testid="input-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Zip Code *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="92126" data-testid="input-manual-zipcode" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="propertyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-property-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Single Family">Single Family</SelectItem>
                            <SelectItem value="Condo">Condo</SelectItem>
                            <SelectItem value="Townhouse">Townhouse</SelectItem>
                            <SelectItem value="Multi-Family">Multi-Family</SelectItem>
                            <SelectItem value="Land">Land</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="500000"
                            value={field.value ?? ""}
                            onChange={e => {
                              const val = e.target.value;
                              field.onChange(val === "" ? undefined : Number(val));
                            }}
                            data-testid="input-manual-price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bedrooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bedrooms *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="3"
                            value={field.value ?? ""}
                            onChange={e => {
                              const val = e.target.value;
                              field.onChange(val === "" ? undefined : Number(val));
                            }}
                            data-testid="input-manual-bedrooms"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bathrooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bathrooms *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.5"
                            placeholder="2"
                            value={field.value ?? ""}
                            onChange={e => {
                              const val = e.target.value;
                              field.onChange(val === "" ? undefined : Number(val));
                            }}
                            data-testid="input-manual-bathrooms"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="squareFeet"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Square Feet *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="1500"
                            value={field.value ?? ""}
                            onChange={e => {
                              const val = e.target.value;
                              field.onChange(val === "" ? undefined : Number(val));
                            }}
                            data-testid="input-manual-squarefeet"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="yearBuilt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year Built</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            placeholder="2000"
                            value={field.value || ""}
                            onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            data-testid="input-yearbuilt"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="propertyOwner"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Property Owner</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="John Doe" data-testid="input-owner" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Contact Name</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="ABC Realty" data-testid="input-company-contact" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyContactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Contact Email</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="email" placeholder="contact@company.com" data-testid="input-company-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="purchasePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Price</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="450000"
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-purchase-price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dateSold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date Sold</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="date" data-testid="input-date-sold" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ""} placeholder="Property details..." rows={3} data-testid="input-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={handleClose} 
                    className="flex-1" 
                    disabled={isManualSubmitting}
                    data-testid="button-cancel-manual"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    className="flex-1" 
                    disabled={isManualSubmitting}
                    data-testid="button-submit-manual"
                  >
                    {isManualSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Property"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
