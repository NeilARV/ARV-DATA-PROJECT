import { Property } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload } from "lucide-react";

interface UploadDataTabProps {
  properties: Property[];
  onOpenUpload: () => void;
}

export default function UploadDataTab({ properties, onOpenUpload }: UploadDataTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Property Data</CardTitle>
        <CardDescription>
          Import properties from CSV or Excel files, or add them manually
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <CloudUpload className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">Upload Properties</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Click the button below to upload a CSV or Excel file
            containing property data, or manually enter individual
            properties.
          </p>
          <Button
            size="lg"
            onClick={onOpenUpload}
            data-testid="button-open-upload"
          >
            <CloudUpload className="w-5 h-5 mr-2" />
            Upload Properties
          </Button>
          {properties && (
            <p className="text-sm text-muted-foreground mt-4">
              Current database: {properties.length} propert
              {properties.length === 1 ? "y" : "ies"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

