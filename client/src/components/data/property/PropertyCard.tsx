import { Card } from '@/components/ui/card';
import type { Property } from '@/types/property';
import { PropertyContent } from './PropertyContent';

type PropertyCardProps = {
    property: Property;
    onClick?: () => void;
};

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
