import { useState } from 'react';
import PropertyDetailModal from '../PropertyDetailModal';
import { Button } from '@/components/ui/button';
import propertyImage from '@assets/generated_images/Modern_suburban_family_home_ea49b726.png';

export default function PropertyDetailModalExample() {
  const [open, setOpen] = useState(false);

  const mockProperty = {
    id: '1',
    address: '123 Maple Street',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    price: 1250000,
    bedrooms: 4,
    bathrooms: 2.5,
    squareFeet: 2400,
    propertyType: 'Single Family',
    imageUrl: propertyImage,
    latitude: 37.7749,
    longitude: -122.4194,
    description: 'Stunning modern home in the heart of San Francisco. Features include updated kitchen with stainless steel appliances, hardwood floors throughout, spacious backyard perfect for entertaining, and a two-car garage.',
    yearBuilt: 2018,
  };

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)} data-testid="button-open-modal">
        Open Property Details
      </Button>
      <PropertyDetailModal
        property={mockProperty}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
