import { useState } from "react";
import { Property } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RetrieveDataTabProps {
  properties: Property[];
}

export default function RetrieveDataTab({ properties }: RetrieveDataTabProps) {
  const { toast } = useToast();
  const [isRetrievingData, setIsRetrievingData] = useState(false);

  const handleRetrieveData = async () => {
    if (isRetrievingData) return; // Prevent multiple calls
    
    setIsRetrievingData(true);
    try {
      //const res = await apiRequest("POST", "/api/data/sfr");
      const res = await apiRequest("POST", "/api/data/v2/sfr");
      const data = await res.json();
      console.log("SFR Data Response:", data);
      toast({
        title: "Data Retrieved Successfully",
        description: `Processed ${data.totalProcessed || 0} properties. Inserted: ${data.totalInserted || 0}, Updated: ${data.totalUpdated || 0}`,
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/properties');
        }
      });
    } catch (error) {
      console.error("Error fetching SFR data:", error);
      toast({
        title: "Error",
        description: "Failed to retrieve data from SFR API",
        variant: "destructive",
      });
    } finally {
      setIsRetrievingData(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrieve Property Data</CardTitle>
        <CardDescription>
          Fetch property data from the SFR Analytics API and sync it to your database
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Database className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">Retrieve Data from API</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Click the button below to retrieve property data from the SFR Analytics API.
            The system will automatically sync new properties and update existing ones based on sale dates.
          </p>
          <Button
            size="lg"
            onClick={handleRetrieveData}
            disabled={isRetrievingData}
            data-testid="button-retrieve-sfr-data"
          >
            {isRetrievingData ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Retrieving Data...
              </>
            ) : (
              <>
                <Database className="w-5 h-5 mr-2" />
                Retrieve Data from API
              </>
            )}
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

