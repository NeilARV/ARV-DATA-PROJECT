import { Card } from "@/components/ui/card";
import { PropertyCardProps } from "@/types/property";
import { PropertyContent } from "./PropertyContent";

export default function PropertyCard({ property, onClick }: PropertyCardProps) {
  return (
    <Card
      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-shadow"
      onClick={onClick}
      data-testid={`card-property-${property.id}`}
    >
      <PropertyContent variant="card" property={property} />
    </Card>
  );
}
