import PropertyMap from '../PropertyMap';
import propertyImage1 from '@assets/generated_images/Modern_suburban_family_home_ea49b726.png';
import propertyImage2 from '@assets/generated_images/Luxury_ranch_style_home_5e6e8db5.png';

export default function PropertyMapExample() {
  const mockProperties = [
    {
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
      imageUrl: propertyImage1,
      latitude: 37.7749,
      longitude: -122.4194,
      description: null,
      yearBuilt: null,
    },
    {
      id: '2',
      address: '456 Oak Avenue',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94103',
      price: 980000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1800,
      propertyType: 'Townhouse',
      imageUrl: propertyImage2,
      latitude: 37.7699,
      longitude: -122.4144,
      description: null,
      yearBuilt: null,
    },
  ];

  return (
    <div className="h-screen">
      <PropertyMap 
        properties={mockProperties}
        onPropertyClick={(property) => console.log('Property clicked:', property)}
      />
    </div>
  );
}
