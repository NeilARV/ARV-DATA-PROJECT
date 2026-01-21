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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
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
  const [parsedData, setParsedData] = useState<Array<{
    address: string;
    city: string;
    state: string;
    zipCode: string;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form for manual entry - Only address fields
  const manualEntrySchema = z.object({
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    zipCode: z.string().min(1, "Zip Code is required"),
  });

  const form = useForm<z.infer<typeof manualEntrySchema>>({
    resolver: zodResolver(manualEntrySchema),
    defaultValues: {
      address: "",
      city: "",
      state: "",
      zipCode: "",
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
    const isCSV = file.name.endsWith(".csv");
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (!isCSV && !isExcel) {
      setError("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
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
          setError("Error reading CSV file");
          console.error("File read error:", err);
        },
      });
    } else {
      // Handle Excel files
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Get range to find actual data
          const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

          // Try to find the header row by looking for rows with actual data
          let headerRowIndex = 0;
          let jsonData: any[] = [];

          for (
            let rowIndex = range.s.r;
            rowIndex <= Math.min(range.s.r + 10, range.e.r);
            rowIndex++
          ) {
            const testData = XLSX.utils.sheet_to_json(worksheet, {
              range: rowIndex,
              defval: "",
            });

            if (testData.length > 0) {
              const firstRow = testData[0] as any;
              const keys = Object.keys(firstRow);

              // Check if this row has meaningful column names (not just __EMPTY)
              const hasRealHeaders = keys.some(
                (key) =>
                  !key.startsWith("__EMPTY") &&
                  key.trim() !== "" &&
                  typeof firstRow[key] === "string" &&
                  firstRow[key].trim() !== "",
              );

              if (hasRealHeaders) {
                headerRowIndex = rowIndex;
                jsonData = XLSX.utils.sheet_to_json(worksheet, {
                  range: rowIndex,
                  defval: "",
                });
                break;
              }
            }
          }

          // If no header row found, try with default parsing but filter out __EMPTY columns
          if (jsonData.length === 0) {
            const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            jsonData = rawData.map((row: any) => {
              const cleanedRow: any = {};
              Object.keys(row).forEach((key) => {
                if (!key.startsWith("__EMPTY")) {
                  cleanedRow[key] = row[key];
                }
              });
              return cleanedRow;
            });
          }

          processData(jsonData);
        } catch (err) {
          setError(
            "Error reading Excel file. Please make sure it has the correct format.",
          );
          console.error("Excel read error:", err);
        }
      };
      reader.onerror = () => {
        setError("Error reading Excel file");
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Smart field name mapping - recognizes common variations
  const fieldMappings: Record<string, string[]> = {
    address: [
      "address",
      "addr",
      "street",
      "streetaddress",
      "street address",
      "property address",
      "location",
    ],
    city: ["city", "town", "municipality"],
    state: ["state", "st", "province"],
    zipCode: [
      "zipcode",
      "zip",
      "zip code",
      "postalcode",
      "postal code",
      "postcode",
    ],
    price: [
      "price",
      "salesprice",
      "sales price",
      "saleprice",
      "sale price",
      "selling price",
      "sellingprice",
      "listprice",
      "list price",
      "amount",
      "cost",
    ],
    bedrooms: [
      "bedrooms",
      "beds",
      "bed",
      "br",
      "bedroom",
      "numberofbedrooms",
      "number of bedrooms",
    ],
    bathrooms: [
      "bathrooms",
      "baths",
      "bath",
      "ba",
      "bathroom",
      "numberofbathrooms",
      "number of bathrooms",
    ],
    squareFeet: [
      "squarefeet",
      "sqft",
      "sq ft",
      "square feet",
      "squarefootage",
      "square footage",
      "size",
      "area",
    ],
    propertyType: [
      "propertytype",
      "property type",
      "type",
      "hometype",
      "home type",
      "dwelling type",
      "dwellingtype",
    ],
    imageUrl: [
      "imageurl",
      "image",
      "photo",
      "picture",
      "imagelink",
      "image url",
    ],
    latitude: ["latitude", "lat"],
    longitude: ["longitude", "lng", "lon", "long"],
    description: ["description", "desc", "details", "notes", "comments"],
    yearBuilt: [
      "yearbuilt",
      "year built",
      "built",
      "year",
      "construction year",
      "constructionyear",
    ],
    propertyOwner: [
      "propertyowner",
      "property owner",
      "owner",
      "ownername",
      "owner name",
      "company",
      "companyname",
      "company name",
      "seller",
      "vendor",
      "sellername",
      "seller name",
    ],
    companyContactName: [
      "companycontactname",
      "company contact name",
      "contactname",
      "contact name",
      "contact",
      "contactperson",
      "contact person",
      "representative",
      "rep",
    ],
    companyContactEmail: [
      "companycontactemail",
      "company contact email",
      "contactemail",
      "contact email",
      "email",
    ],
    purchasePrice: [
      "purchaseprice",
      "purchase price",
      "bought price",
      "boughtprice",
      "acquisition price",
      "acquisitionprice",
    ],
    dateSold: [
      "datesold",
      "date sold",
      "solddate",
      "sold date",
      "saledate",
      "sale date",
      "closing date",
      "closingdate",
      "settlement date",
      "settlementdate",
    ],
  };

  // Normalize field name for matching
  const normalizeFieldName = (name: string): string => {
    return name.toLowerCase().replace(/[\s_-]/g, "");
  };

  // Find the value from row using field mapping
  const findFieldValue = (row: any, targetField: string): any => {
    const variations = fieldMappings[targetField] || [targetField];

    for (const key of Object.keys(row)) {
      const normalizedKey = normalizeFieldName(key);
      if (variations.some((v) => normalizeFieldName(v) === normalizedKey)) {
        return row[key];
      }
    }

    return null;
  };

  // New processData function with improved handling of CSV format (no longer removes 2 properties)
  const processData = (data: any[]) => {
    try {

      if (data.length === 0) {
        setError("The file appears to be empty. Please provide a file with property data.");
        return;
      }

      // Helper to safely parse numbers
      const safeParseFloat = (val: any) => {
        if (val === null || val === undefined || val === "") return null;
        // Remove $ and commas from currency strings
        const cleaned = String(val).replace(/[$,*]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? null : parsed;
      };

      // Get all keys to find __EMPTY columns
      const allKeys = data.length > 0 ? Object.keys(data[0]) : [];
      const emptyKeys = allKeys.filter(key => key.startsWith('__EMPTY'));

      const properties = data
        .map((row: any, index: number) => {
          // If data is in __EMPTY columns, use those instead
          let ownerName, address, city, zipCode, saleDate, salePrice;

          if (emptyKeys.length > 0) {
            // Data is in __EMPTY columns - map them positionally
            // Based on your structure: OWNER NAME, ADDRESS, CITY, ZIP CODE, SALE DATE, SALE PRICE
            const values = emptyKeys.map(key => row[key]);

            // Try to find which __EMPTY columns have the actual data
            // Look for a pattern: address-like string, city, zipcode, price
            ownerName = values[0] || row['OWNER NAME'];
            address = values[1] || row['ADDRESS'];
            city = values[2] || row['CITY'];
            zipCode = values[3] || row['ZIP CODE'];
            saleDate = values[4] || row['SALE DATE'];
            salePrice = values[5] || row['SALE PRICE'];
          } else {
            // Use regular columns
            ownerName = findFieldValue(row, "propertyOwner");
            address = findFieldValue(row, "address");
            city = findFieldValue(row, "city");
            zipCode = findFieldValue(row, "zipCode");
            saleDate = findFieldValue(row, "dateSold");
            salePrice = findFieldValue(row, "price");
          }

          return {
            address: address || "",
            city: city || "",
            state: "CA", // Default to CA
            zipCode: String(zipCode || "").trim(),
          };
        })
        .filter((prop: any) => {
          // Filter out empty rows
          const hasAddress = prop.address && prop.address.trim() !== "";
          const hasCity = prop.city && prop.city.trim() !== "";
          const hasZipCode = prop.zipCode && prop.zipCode.trim() !== "";

          // Also filter out rows where address looks like it's just a company name repeated
          const addressLooksValid = hasAddress && 
            prop.address.length > 5 && 
            !prop.address.toLowerCase().includes('acropolis') &&
            !prop.address.toLowerCase().includes('rich montano');

          return hasAddress && hasCity && hasZipCode && addressLooksValid;
        });

      console.log("Valid properties after filtering:", properties.length);
      console.log("Sample property:", properties[0]);

      if (properties.length === 0) {
        const columnNames = data.length > 0 ? Object.keys(data[0]) : [];
        setError(`No valid properties found. Columns found: ${columnNames.join(", ")}`);
        return;
      }

      setParsedData(properties);
    } catch (err) {
      setError("Error parsing file. Please check the format.");
      console.error("Parse error:", err);
    }
  };

  const handleUpload = async () => {
    // File upload is temporarily disabled - endpoint not ready
    setError("File upload is currently disabled. Please use manual entry.");
    toast({
      title: "File Upload Disabled",
      description: "File upload is currently unavailable. Please use the Manual Entry tab.",
      variant: "destructive",
    });
    return;
    
    // The code below is temporarily disabled until the /api/properties/upload endpoint is ready
    /*
    if (!parsedData) {
      return;
    }
    
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

          setUploadStatus(
            `Uploading batch ${batchNum}/${totalBatches} (${batch.length} properties)...`,
          );

          const response = (await apiRequest(
            "POST",
            "/api/properties/upload",
            batch,
            15 * 60 * 1000,
          )) as any;

          const data = await response.json();

          totalUploaded += data.count || 0;

          if (response.warnings?.failedAddresses) {
            allWarnings.push(...response.warnings.failedAddresses);
          }
        }

        console.log("Total Uploaded: ", totalUploaded);

        // Check if NO properties were uploaded (complete failure)
        if (totalUploaded === 0) {
          const errorMsg =
            allWarnings.length > 0
              ? `Failed to geocode addresses: ${allWarnings.slice(0, 3).join(", ")}${allWarnings.length > 3 ? "..." : ""}`
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
            description: `Uploaded ${totalUploaded} propert${totalUploaded === 1 ? "y" : "ies"} but failed to geocode ${allWarnings.length} address${allWarnings.length === 1 ? "" : "es"}`,
            variant: "default",
          });
        } else {
          toast({
            title: "Upload Successful",
            description: `Successfully uploaded ${totalUploaded} propert${totalUploaded === 1 ? "y" : "ies"}`,
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
    */
  };

  const handleManualSubmit = async (
    data: z.infer<typeof manualEntrySchema>,
  ) => {
    setIsManualSubmitting(true);
    setError(null);

    try {
      // Create property data with only address fields
      const propertyData = {
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
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
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-upload"
      >
        <DialogHeader>
          <DialogTitle>Add Property Data</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" data-testid="tab-file-upload" disabled>
              File Upload (Disabled)
            </TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-manual-entry">
              Manual Entry
            </TabsTrigger>
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
                          <th className="text-left py-2">City</th>
                          <th className="text-left py-2">State</th>
                          <th className="text-left py-2">Zip Code</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.slice(0, 5).map((prop, idx) => (
                          <tr key={idx} className="border-b border-border">
                            <td className="py-2">{prop.address}</td>
                            <td className="py-2">{prop.city}</td>
                            <td className="py-2">{prop.state}</td>
                            <td className="py-2">{prop.zipCode}</td>
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
              <form
                onSubmit={form.handleSubmit(handleManualSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Address *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="123 Main St"
                            required
                            data-testid="input-address"
                          />
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
                          <Input
                            {...field}
                            placeholder="San Diego"
                            required
                            data-testid="input-city"
                          />
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
                          <Input
                            {...field}
                            placeholder="CA"
                            maxLength={2}
                            required
                            data-testid="input-state"
                          />
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
                          <Input
                            {...field}
                            placeholder="92126"
                            required
                            data-testid="input-manual-zipcode"
                          />
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
