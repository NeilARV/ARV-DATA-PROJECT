import PropertyCard from '../PropertyCard';
import propertyImage from '@assets/generated_images/Modern_suburban_family_home_ea49b726.png';

export default function PropertyCardExample() {
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
    description: 'Beautiful modern home',
    yearBuilt: 2018,
  };

  return (
    <div className="max-w-sm">
      <PropertyCard property={mockProperty} onClick={() => console.log('Property clicked')} />
    </div>
  );
}
