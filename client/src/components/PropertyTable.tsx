import { Property } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/dateUtils";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PropertyTableProps {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
}

type SortColumn = "address" | "city" | "price" | "bedrooms" | "bathrooms" | "squareFeet" | "propertyType" | "dateSold" | "propertyOwner";
type SortDirection = "asc" | "desc";

export default function PropertyTable({ properties, onPropertyClick }: PropertyTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("address");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedProperties = [...properties].sort((a, b) => {
    let aValue: any = a[sortColumn];
    let bValue: any = b[sortColumn];

    // Handle null/undefined values
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    // Column-specific sorting logic
    if (sortColumn === "price" || sortColumn === "squareFeet" || sortColumn === "bedrooms" || sortColumn === "bathrooms") {
      // Numeric columns
      aValue = Number(aValue);
      bValue = Number(bValue);
    } else if (sortColumn === "dateSold") {
      // Date column
      aValue = aValue ? new Date(aValue).getTime() : 0;
      bValue = bValue ? new Date(bValue).getTime() : 0;
    } else if (typeof aValue === "string") {
      // String columns (address, city, propertyType, propertyOwner)
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const SortButton = ({ column, children }: { column: SortColumn; children: React.ReactNode }) => {
    const isActive = sortColumn === column;
    return (
      <button
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 font-medium hover-elevate active-elevate-2 px-3 py-1 rounded-md -ml-3"
        data-testid={`button-sort-${column}`}
      >
        {children}
        <ArrowUpDown 
          className={`h-3 w-3 transition-transform ${
            isActive ? (sortDirection === "asc" ? "rotate-180" : "") : "opacity-50"
          }`} 
        />
      </button>
    );
  };

  return (
    <div className="w-full overflow-auto" data-testid="table-properties">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">
              <SortButton column="address">Address</SortButton>
            </TableHead>
            <TableHead className="min-w-[120px]">
              <SortButton column="city">City</SortButton>
            </TableHead>
            <TableHead className="min-w-[120px]">
              <SortButton column="price">Price</SortButton>
            </TableHead>
            <TableHead className="text-center">
              <SortButton column="bedrooms">Beds</SortButton>
            </TableHead>
            <TableHead className="text-center">
              <SortButton column="bathrooms">Baths</SortButton>
            </TableHead>
            <TableHead className="text-center">
              <SortButton column="squareFeet">Sq Ft</SortButton>
            </TableHead>
            <TableHead className="min-w-[120px]">
              <SortButton column="propertyType">Type</SortButton>
            </TableHead>
            <TableHead className="min-w-[150px]">
              <SortButton column="propertyOwner">Owner</SortButton>
            </TableHead>
            <TableHead className="min-w-[120px]">
              <SortButton column="dateSold">Date Sold</SortButton>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProperties.map((property) => (
            <TableRow
              key={property.id}
              onClick={() => onPropertyClick(property)}
              className="cursor-pointer hover-elevate"
              data-testid={`row-property-${property.id}`}
            >
              <TableCell className="font-medium">
                <div>{property.address}</div>
                <div className="text-xs text-muted-foreground">
                  {property.state} {property.zipCode}
                </div>
              </TableCell>
              <TableCell>{property.city}</TableCell>
              <TableCell className="font-semibold">
                ${property.price.toLocaleString()}
              </TableCell>
              <TableCell className="text-center">{property.bedrooms}</TableCell>
              <TableCell className="text-center">{property.bathrooms}</TableCell>
              <TableCell className="text-center">
                {property.squareFeet.toLocaleString()}
              </TableCell>
              <TableCell>{property.propertyType}</TableCell>
              <TableCell>
                {property.propertyOwner || (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {property.dateSold ? (
                  formatDate(property.dateSold)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {sortedProperties.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                No properties found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
