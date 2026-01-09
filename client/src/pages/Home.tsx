import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import FilterSidebar, { PropertyFilters } from "@/components/FilterSidebar";
import CompanyDirectory from "@/components/CompanyDirectory";
import PropertyMap from "@/components/property/PropertyMap";
import GridView from "@/components/views/GridView";
import TableView from "@/components/views/TableView";
import PropertyDetailPanel from "@/components/property/PropertyDetailPanel";
import PropertyDetailModal from "@/components/property/PropertyDetailModal";
import UploadDialog from "@/components/modals/UploadDialog";
import SignupDialog from "@/components/modals/SignupDialog";
import LoginDialog from "@/components/modals/LoginDialog";
import LeaderboardDialog from "@/components/modals/LeaderboardDialog";
import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Filter, Building2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useAuth, useSignupPrompt } from "@/hooks/use-auth";
import { SAN_DIEGO_ZIP_CODES, ORANGE_ZIP_CODES, LOS_ANGELES_ZIP_CODES, COUNTIES, MAX_PRICE } from "@/constants/filters.constants";
import type { MapPin } from '@/types/property';

type SortOption = "recently-sold" | "days-held" | "price-high-low" | "price-low-high";

export default function Home() {
  const [viewMode, setViewMode] = useState<"map" | "grid" | "table" | "buyers-feed">("map");
  const [sidebarView, setSidebarView] = useState<"filters" | "directory" | "none">("directory");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [filters, setFilters] = useState<PropertyFilters>({
    minPrice: 0,
    maxPrice: 10000000, // Default to max slider value
    bedrooms: 'Any',
    bathrooms: 'Any',
    propertyTypes: [],
    zipCode: '',
    city: undefined,
    county: 'San Diego', // Default to San Diego county
    statusFilters: ['in-renovation'],
  });
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [sortBy, setSortBy] = useState<SortOption>("recently-sold");
  
  // Pagination state for infinite scroll (grid/table views)
  const [propertiesPage, setPropertiesPage] = useState(1);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [propertiesHasMore, setPropertiesHasMore] = useState(true);
  const [isLoadingMoreProperties, setIsLoadingMoreProperties] = useState(false);
  const loadMorePropertiesRef = useRef<HTMLDivElement>(null);

  // Pagination state for buyers feed view
  const [buyersFeedPage, setBuyersFeedPage] = useState(1);
  const [allBuyersFeedProperties, setAllBuyersFeedProperties] = useState<Property[]>([]);
  const [buyersFeedHasMore, setBuyersFeedHasMore] = useState(true);
  const [isLoadingMoreBuyersFeed, setIsLoadingMoreBuyersFeed] = useState(false);
  const loadMoreBuyersFeedRef = useRef<HTMLDivElement>(null);
  
  const [showSignupDialog, setShowSignupDialog] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false);
  const [isDialogForced, setIsDialogForced] = useState(false);
  
  const { user, isAuthenticated } = useAuth();
  const { shouldShowSignup, isForced, dismissPrompt } = useSignupPrompt();
  const geolocationAttemptedRef = useRef(false);
  
  // Helper function to get county center from COUNTIES array
  const getCountyCenter = (countyName: string): [number, number] | undefined => {
    const county = COUNTIES.find(c => c.county === countyName);
    return county?.center as [number, number] | undefined;
  };
  
  // Get default San Diego center from COUNTIES array
  const getDefaultMapCenter = (): [number, number] => {
    return getCountyCenter('San Diego') ?? [32.7157, -117.1611]; // Fallback if not found
  };
  
  useEffect(() => {
    if (shouldShowSignup && !isAuthenticated) {
      setShowSignupDialog(true);
      setIsDialogForced(isForced);
    }
  }, [shouldShowSignup, isAuthenticated, isForced]);

  // Get user's location on initial mount (only runs once)
  useEffect(() => {
    // Only attempt geolocation once on mount
    if (geolocationAttemptedRef.current) {
      return;
    }

    geolocationAttemptedRef.current = true;

    // Check if geolocation is available
    if (!navigator.geolocation) {
      console.log('Geolocation is not supported by this browser. Using San Diego as default.');
      setMapCenter(getDefaultMapCenter());
      setMapZoom(12);
      return;
    }

    // Request user's location with timeout
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocode to get county using backend API (proxies Census API to avoid CORS)
          const response = await fetch(`/api/geocoding/county?longitude=${longitude}&latitude=${latitude}`, {
            credentials: "include",
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch county: ${response.status}`);
          }
          
          const data = await response.json();
          const userCounty = data.county;
          
          if (userCounty) {
            // Check if user's county is in the enabled counties list
            // Currently enabled: San Diego
            // Future: Orange, Los Angeles, Denver (currently disabled in COUNTIES)
            const enabledCounties = COUNTIES.map(c => c.county);
            const isEnabledCounty = enabledCounties.some(
              enabledCounty => enabledCounty.toLowerCase() === userCounty.toLowerCase()
            );
            
            if (isEnabledCounty) {
              // User is in an enabled county - center to their location
              setMapCenter([latitude, longitude]);
              setMapZoom(12);
              console.log(`User located in ${userCounty} County - centering map to user location`);
            } else {
              // User is not in an enabled county - use default county center
              const defaultCounty = enabledCounties[0] || 'San Diego';
              const defaultCenter = getCountyCenter(defaultCounty) ?? getDefaultMapCenter();
              setMapCenter(defaultCenter);
              setMapZoom(12);
              console.log(`User located in ${userCounty} County (not enabled) - using default center for ${defaultCounty}`);
            }
          } else {
            // Reverse geocoding failed - center to user location anyway
            console.warn('Failed to reverse geocode user location, centering to user coordinates');
            setMapCenter([latitude, longitude]);
            setMapZoom(12);
          }
        } catch (error) {
          // Error fetching county - center to user location anyway
          console.error('Error fetching county from user location:', error);
          setMapCenter([latitude, longitude]);
          setMapZoom(12);
        }
      },
      (error) => {
        // Fall back to San Diego if geolocation fails or is denied
        console.log('Geolocation failed or denied, using San Diego as default:', error);
        setMapCenter(getDefaultMapCenter());
        setMapZoom(12);
      },
      {
        enableHighAccuracy: false, // Use less accurate but faster method
        timeout: 5000, // 5 second timeout
        maximumAge: 300000, // Accept cached location up to 5 minutes old
      }
    );
  }, []); // Empty dependency array - only runs once on mount

  // Build query parameters based on county filter
  const countyQueryParam = useMemo(() => {
    const county = filters.county ?? 'San Diego';
    return county ? `?county=${encodeURIComponent(county)}` : '';
  }, [filters.county]);

  const propertiesQueryParam = useMemo(() => {
    const params = new URLSearchParams();
    
    // County filter
    if (filters.county) {
      params.append('county', filters.county);
    }
    
    // Zipcode filter
    if (filters.zipCode && filters.zipCode.trim() !== '') {
      params.append('zipcode', filters.zipCode.trim());
    }
    
    // City filter
    if (filters.city && filters.city.trim() !== '') {
      params.append('city', filters.city.trim());
    }
    
    // Price range filters
    if (filters.minPrice > 0) {
      params.append('minPrice', filters.minPrice.toString());
    }
    
    if (filters.maxPrice < 10000000) { // Only add if not the default max
      params.append('maxPrice', filters.maxPrice.toString());
    }
    
    // Bedrooms filter (only if not 'Any')
    if (filters.bedrooms && filters.bedrooms !== 'Any') {
      // Extract number from strings like "1+", "2+", etc.
      const bedroomsNum = filters.bedrooms.replace('+', '');
      params.append('bedrooms', bedroomsNum);
    }
    
    // Bathrooms filter (only if not 'Any')
    if (filters.bathrooms && filters.bathrooms !== 'Any') {
      // Extract number from strings like "1+", "2+", etc.
      const bathroomsNum = filters.bathrooms.replace('+', '');
      params.append('bathrooms', bathroomsNum);
    }
    
    // Property types filter (can have multiple)
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
      filters.propertyTypes.forEach(type => {
        params.append('propertyType', type);
      });
    }
    
    // Status filters (can have multiple)
    if (filters.statusFilters && filters.statusFilters.length > 0) {
      filters.statusFilters.forEach(status => {
        params.append('status', status);
      });
    }
    
    // Company/Property Owner filter
    if (selectedCompany) {
      params.append('company', selectedCompany);
    }
    
    // Pagination - use current page state
    params.append('page', propertiesPage.toString());
    // Table view loads 20, grid view loads 10
    const limit = viewMode === "table" ? "20" : "10";
    params.append('limit', limit);
    
    // Sort by parameter
    params.append('sortBy', sortBy);
    
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }, [filters, selectedCompany, propertiesPage, sortBy, viewMode]);

  // Build the API URL with all filter query parameters for full properties (grid/table views)
  const propertiesQueryUrl = useMemo(() => {
    return `/api/properties${propertiesQueryParam}`;
  }, [propertiesQueryParam]);

  // Build the API URL for map pins (minimal data for map view)
  const mapPinsQueryUrl = useMemo(() => {
    return `/api/properties/map${countyQueryParam}`;
  }, [countyQueryParam]);


  // Fetch map pins (minimal data) for map view
  const { data: mapPins = [], isLoading: isLoadingMapPins } = useQuery<MapPin[]>({
    queryKey: [mapPinsQueryUrl],
    queryFn: async () => {
      const res = await fetch(mapPinsQueryUrl, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch map pins: ${res.status}`);
      }
      return res.json();
    },
    enabled: viewMode === "map", // Only fetch when in map view
  });

  // Fetch full properties from backend filtered by county (for grid/table views)
  const { data: propertiesResponse, isLoading, isFetching } = useQuery<{ properties: Property[]; total: number; hasMore: boolean }>({
    queryKey: [propertiesQueryUrl],
    queryFn: async () => {
      const res = await fetch(propertiesQueryUrl, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch properties: ${res.status}`);
      }
      return res.json();
    },
    enabled: viewMode !== "map" && viewMode !== "buyers-feed", // Only fetch when NOT in map or buyers-feed view
  });

  const totalFilteredProperties = propertiesResponse?.total ?? 0;

  // Reset pagination when filters, sortBy, or view mode changes
  useEffect(() => {
    if (viewMode !== "map" && viewMode !== "buyers-feed") {
      setPropertiesPage(1);
      setAllProperties([]);
      setPropertiesHasMore(true);
      setIsLoadingMoreProperties(false);
    }
  }, [filters, selectedCompany, viewMode, sortBy]);

  // Accumulate properties when new data arrives (for grid/table views)
  useEffect(() => {
    if (propertiesResponse && (viewMode === "grid" || viewMode === "table")) {
      if (propertiesPage === 1) {
        // First page - replace all
        setAllProperties(propertiesResponse.properties);
      } else {
        // Subsequent pages - append, but filter out duplicates by ID
        setAllProperties((prev) => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProperties = propertiesResponse.properties.filter(p => !existingIds.has(p.id));
          return [...prev, ...newProperties];
        });
      }
      setPropertiesHasMore(propertiesResponse.hasMore);
      setIsLoadingMoreProperties(false);
    }
  }, [propertiesResponse, propertiesPage, viewMode]);

  // Intersection Observer for infinite scroll (grid/table views)
  useEffect(() => {
    if (viewMode !== "grid" && viewMode !== "table") return;
    if (!propertiesHasMore || isLoadingMoreProperties || isFetching) return;
    if (!loadMorePropertiesRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && propertiesHasMore && !isLoadingMoreProperties && !isFetching) {
          setIsLoadingMoreProperties(true);
          setPropertiesPage((prev) => prev + 1);
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '100px' // Start loading 100px before reaching the element
      }
    );

    const currentRef = loadMorePropertiesRef.current;
    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [viewMode, propertiesHasMore, isLoadingMoreProperties, isFetching, allProperties.length]);

  const properties = allProperties; // Total properties matching all filters (county, price, etc.)

  // Build query parameters for buyers feed (same as grid view but with hasDateSold=true)
  const buyersFeedQueryParam = useMemo(() => {
    const params = new URLSearchParams();
    
    // County filter
    if (filters.county) {
      params.append('county', filters.county);
    }
    
    // Zipcode filter
    if (filters.zipCode && filters.zipCode.trim() !== '') {
      params.append('zipcode', filters.zipCode.trim());
    }
    
    // City filter
    if (filters.city && filters.city.trim() !== '') {
      params.append('city', filters.city.trim());
    }
    
    // Price range filters
    if (filters.minPrice > 0) {
      params.append('minPrice', filters.minPrice.toString());
    }
    
    if (filters.maxPrice < 10000000) {
      params.append('maxPrice', filters.maxPrice.toString());
    }
    
    // Bedrooms filter (only if not 'Any')
    if (filters.bedrooms && filters.bedrooms !== 'Any') {
      const bedroomsNum = filters.bedrooms.replace('+', '');
      params.append('bedrooms', bedroomsNum);
    }
    
    // Bathrooms filter (only if not 'Any')
    if (filters.bathrooms && filters.bathrooms !== 'Any') {
      const bathroomsNum = filters.bathrooms.replace('+', '');
      params.append('bathrooms', bathroomsNum);
    }
    
    // Property types filter (can have multiple)
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
      filters.propertyTypes.forEach(type => {
        params.append('propertyType', type);
      });
    }
    
    // Status filters (can have multiple)
    if (filters.statusFilters && filters.statusFilters.length > 0) {
      filters.statusFilters.forEach(status => {
        params.append('status', status);
      });
    }
    
    // Company/Property Owner filter
    if (selectedCompany) {
      params.append('company', selectedCompany);
    }
    
    // Only properties with dateSold
    params.append('hasDateSold', 'true');
    
    // Pagination - use current page state
    params.append('page', buyersFeedPage.toString());
    params.append('limit', '10');
    
    // Sort by parameter
    params.append('sortBy', sortBy);
    
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }, [filters, selectedCompany, buyersFeedPage, sortBy]);

  // Build the API URL for buyers feed
  const buyersFeedQueryUrl = useMemo(() => {
    return `/api/properties${buyersFeedQueryParam}`;
  }, [buyersFeedQueryParam]);

  // Fetch buyers feed properties with pagination
  const { data: buyersFeedResponse, isLoading: isLoadingBuyersFeed, isFetching: isFetchingBuyersFeed } = useQuery<{ properties: Property[]; total: number; hasMore: boolean }>({
    queryKey: [buyersFeedQueryUrl],
    queryFn: async () => {
      const res = await fetch(buyersFeedQueryUrl, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch buyers feed properties: ${res.status}`);
      }
      return res.json();
    },
    enabled: viewMode === "buyers-feed",
  });

  // Reset pagination when filters, sortBy, or view mode changes for buyers feed
  useEffect(() => {
    if (viewMode === "buyers-feed") {
      setBuyersFeedPage(1);
      setAllBuyersFeedProperties([]);
      setBuyersFeedHasMore(true);
      setIsLoadingMoreBuyersFeed(false);
    }
  }, [filters, selectedCompany, viewMode, sortBy]);

  // Accumulate buyers feed properties when new data arrives
  useEffect(() => {
    if (buyersFeedResponse && viewMode === "buyers-feed") {
      if (buyersFeedPage === 1) {
        // First page - replace all
        setAllBuyersFeedProperties(buyersFeedResponse.properties);
      } else {
        // Subsequent pages - append, but filter out duplicates by ID
        setAllBuyersFeedProperties((prev) => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProperties = buyersFeedResponse.properties.filter(p => !existingIds.has(p.id));
          return [...prev, ...newProperties];
        });
      }
      setBuyersFeedHasMore(buyersFeedResponse.hasMore);
      setIsLoadingMoreBuyersFeed(false);
    }
  }, [buyersFeedResponse, buyersFeedPage, viewMode]);

  // Intersection Observer for infinite scroll in buyers feed
  useEffect(() => {
    if (viewMode !== "buyers-feed") return;
    if (!buyersFeedHasMore || isLoadingMoreBuyersFeed || isFetchingBuyersFeed) return;
    if (!loadMoreBuyersFeedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && buyersFeedHasMore && !isLoadingMoreBuyersFeed && !isFetchingBuyersFeed) {
          setIsLoadingMoreBuyersFeed(true);
          setBuyersFeedPage((prev) => prev + 1);
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '100px'
      }
    );

    const currentRef = loadMoreBuyersFeedRef.current;
    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [viewMode, buyersFeedHasMore, isLoadingMoreBuyersFeed, isFetchingBuyersFeed, allBuyersFeedProperties.length]);

  const buyersFeedPurchases = allBuyersFeedProperties;

  const handleUploadSuccess = () => {
    // Refresh properties after upload - invalidate all property queries
    //queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    queryClient.invalidateQueries({ queryKey: ["/api/properties/map"] });
  };

  // Check if filters are active (not in initial state) - excludes company selection
  const hasActiveFilters = useMemo(() => {
    return (
      filters.minPrice > 0 ||
      filters.maxPrice < MAX_PRICE ||
      filters.bedrooms !== 'Any' ||
      filters.bathrooms !== 'Any' ||
      filters.propertyTypes.length > 0 ||
      filters.zipCode !== '' ||
      filters.city !== undefined ||
      (filters.county !== undefined && filters.county !== 'San Diego') ||
      filters.statusFilters.length !== 1 ||
      filters.statusFilters[0] !== 'in-renovation'
    );
  }, [filters]);

  // Reset filters to initial state (does not clear company selection)
  const handleClearAllFilters = () => {
    setFilters({
      minPrice: 0,
      maxPrice: MAX_PRICE,
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      county: 'San Diego', // Reset to default San Diego county
      statusFilters: ['in-renovation'],
    });
  };

  // Calculate zip codes with property counts
  // Use map pins in map view, full properties in grid/table views
  const zipCodesWithCounts = useMemo(() => {
    const dataSource = viewMode === "map" ? mapPins : properties;
    const counts: Record<string, number> = {};
    dataSource.forEach(p => {
      const zipCode = viewMode === "map" ? (p as MapPin).zipcode : (p as Property).zipCode;
      counts[zipCode] = (counts[zipCode] || 0) + 1;
    });
    return Object.entries(counts).map(([zipCode, count]) => ({
      zipCode,
      count
    }));
  }, [properties, mapPins, viewMode]);

  useEffect(() => {
    const fetchLocation = async () => {
      // Priority: zipcode > city > county (most specific to least specific)
      
      // Handle zip code filter (highest priority - most specific)
      if (filters?.zipCode && filters.zipCode.trim() !== '') {
        try {
          const response = await fetch(`https://api.zippopotam.us/us/${filters.zipCode.trim()}`);
          if (response.ok) {
            const data = await response.json();
            if (data.places && data.places.length > 0) {
              const lat = parseFloat(data.places[0].latitude);
              const lng = parseFloat(data.places[0].longitude);
              setMapCenter([lat, lng]);
              setMapZoom(13); // Closer zoom for zip code
              return; // Exit early, zipcode takes priority
            }
          }
        } catch (error) {
          console.error('Error fetching zip code location:', error);
        }
      }
      
      // Handle city filter (medium priority)
      if (filters?.city && filters.city.trim() !== '') {
        // Get the appropriate zip code list based on county
        const countyName = filters?.county ?? 'San Diego';
        const currentZipCodeList = countyName === 'Orange' 
          ? ORANGE_ZIP_CODES 
          : countyName === 'Los Angeles' 
          ? LOS_ANGELES_ZIP_CODES 
          : SAN_DIEGO_ZIP_CODES;
        
        // Get the first zip code for this city to use for geocoding
        const cityZipCodes = currentZipCodeList.filter(z => {
          if (filters.city === 'San Diego') {
            return z.city.startsWith('San Diego');
          } else if (filters.city === 'Los Angeles') {
            return z.city.startsWith('Los Angeles') || z.city === 'Los Angeles';
          } else {
            return z.city === filters.city;
          }
        });
        
        if (cityZipCodes.length > 0) {
          try {
            const response = await fetch(`https://api.zippopotam.us/us/${cityZipCodes[0].zip}`);
            if (response.ok) {
              const data = await response.json();
              if (data.places && data.places.length > 0) {
                const lat = parseFloat(data.places[0].latitude);
                const lng = parseFloat(data.places[0].longitude);
                setMapCenter([lat, lng]);
                setMapZoom(12); // Medium zoom for city view
                return; // Exit early, city takes priority over county
              }
            }
          } catch (error) {
            console.error('Error fetching city location:', error);
          }
        }
      }
      
      // Handle county filter (lowest priority - most general)
      // Only center on county if no zipcode or city is selected
      if (filters?.county && filters.county.trim() !== '') {
        const countyCenter = getCountyCenter(filters.county);
        if (countyCenter) {
          setMapCenter(countyCenter);
          setMapZoom(10); // Wider zoom for county view
          return; // Exit early
        }
      }
      
      // Fallback: If no specific location filter, center on the default county (San Diego)
      const defaultCounty = filters?.county ?? 'San Diego';
      const countyCenter = getCountyCenter(defaultCounty);
      if (countyCenter) {
        setMapCenter(countyCenter);
        setMapZoom(10);
      } else {
        setMapCenter(undefined);
        setMapZoom(12);
      }
    };

    fetchLocation();
  }, [filters?.zipCode, filters?.city, filters?.county]);

  // Get the appropriate zip code list based on county filter
  const zipCodeList = useMemo(() => {
    const countyName = filters.county ?? 'San Diego';
    if (countyName === 'Orange') {
      return ORANGE_ZIP_CODES;
    } else if (countyName === 'Los Angeles') {
      return LOS_ANGELES_ZIP_CODES;
    } else {
      return SAN_DIEGO_ZIP_CODES;
    }
  }, [filters.county]);

  // Filter map pins for map view (using minimal data)
  const filteredMapPins = useMemo(() => {
    return mapPins.filter(pin => {
      // Apply company filter first if one is selected
      if (selectedCompany) {
        const ownerName = (pin.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
        const selectedName = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
        if (ownerName !== selectedName) {
          return false;
        }
      }

      // Filter by price
      if (pin.price != null) {
        if (pin.price < filters.minPrice || pin.price > filters.maxPrice) {
          return false;
        }
      }

      // Filter by bedrooms
      if (filters.bedrooms !== 'Any') {
        const minBeds = parseInt(filters.bedrooms);
        if (pin.bedrooms < minBeds) return false;
      }

      // Filter by bathrooms
      if (filters.bathrooms !== 'Any') {
        const minBaths = parseInt(filters.bathrooms);
        if (pin.bathrooms < minBaths) return false;
      }

      // Filter by property type
      if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(pin.propertyType)) {
        return false;
      }

      // Filter by zip code or city
      if (filters.city && filters.city.trim() !== '') {
        const cityZipCodes = zipCodeList
          .filter(z => {
            if (filters.city === 'San Diego') {
              return z.city.startsWith('San Diego');
            } else if (filters.city === 'Los Angeles') {
              return z.city.startsWith('Los Angeles') || z.city === 'Los Angeles';
            } else {
              return z.city === filters.city;
            }
          })
          .map(z => z.zip);
        if (!cityZipCodes.includes(pin.zipcode)) return false;
      } else if (filters.zipCode && filters.zipCode.trim() !== '') {
        if (pin.zipcode !== filters.zipCode.trim()) return false;
      }

      // Filter by status
      if (filters.statusFilters && filters.statusFilters.length > 0) {
        const propertyStatus = pin.status || 'in-renovation';
        if (!filters.statusFilters.includes(propertyStatus)) return false;
      }

      return true;
    });
  }, [mapPins, filters, selectedCompany, zipCodeList]);


  // Use buyers feed properties when in buyers-feed view, otherwise use regular properties
  const propertiesToFilter = viewMode === "buyers-feed" ? buyersFeedPurchases : properties;

  // Filter full properties for grid/table views
  const filteredProperties = propertiesToFilter.filter(property => {
    // Apply company filter first if one is selected (case-insensitive comparison with null safety)
    if (selectedCompany) {
      
      const ownerName = (property.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
      const selectedName = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
      
      if (ownerName !== selectedName) {
        return false;
      }
    }

    // Apply regular filters with null safety
    // Filter by price if price is not null
    if (property.price != null) {
      if (property.price < filters.minPrice || property.price > filters.maxPrice) {
        return false;
      }
    }
    
    if (filters.bedrooms !== 'Any') {
      const minBeds = parseInt(filters.bedrooms);

      if (property.bedrooms < minBeds) return false;
    }

    if (filters.bathrooms !== 'Any') {
      const minBaths = parseInt(filters.bathrooms);
      if (property.bathrooms < minBaths) return false;
    }

    if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(property.propertyType)) {
      return false;
    }

    // Filter by zip code or city
    if (filters.city && filters.city.trim() !== '') {
      // If city filter is set, get all zip codes for that city
      // For "San Diego", match all cities that start with "San Diego" (e.g., "San Diego - Downtown", "San Diego", etc.)
      // For "Los Angeles", match all cities that start with "Los Angeles" or are exactly "Los Angeles"
      // For other cities, do exact match
      const cityZipCodes = zipCodeList
        .filter(z => {
          if (filters.city === 'San Diego') {
            return z.city.startsWith('San Diego');
          } else if (filters.city === 'Los Angeles') {
            return z.city.startsWith('Los Angeles') || z.city === 'Los Angeles';
          } else {
            return z.city === filters.city;
          }
        })
        .map(z => z.zip);
      if (!cityZipCodes.includes(property.zipCode)) return false;
    } else if (filters.zipCode && filters.zipCode.trim() !== '') {
      // If zip code filter is set, filter by zip code
      if (property.zipCode !== filters.zipCode.trim()) return false;
    }

    // Filter by status
    if (filters.statusFilters && filters.statusFilters.length > 0) {
      const propertyStatus = property.status || 'in-renovation';
      if (!filters.statusFilters.includes(propertyStatus)) return false;
    }

    return true;
  });


  const handleCompanySelect = (companyName: string | null) => {
    if (companyName) {
      // Selecting a company: preserve all existing filters and map position
      setSelectedCompany(companyName);
      // Do NOT change map center/zoom when selecting a company
    } else {
      // Deselecting/clearing the company filter: preserve all existing filters and map position
      setSelectedCompany(null);
      // Do NOT change map center/zoom when deselecting a company
    }
  };

  const handleLeaderboardCompanyClick = (companyName: string) => {
    // Preserve all existing filters when selecting a company from leaderboard
    setSelectedCompany(companyName);
    setSidebarView("none");
    // Do NOT change map center/zoom when selecting a company from leaderboard
  };

  const handleCompanyNameClick = (companyName: string) => {
    // Open the directory and select the company
    setSelectedCompany(companyName);
    setSidebarView("directory");
    // The CompanyDirectory component will auto-scroll to the selected company
  };


  const handleLeaderboardZipCodeClick = (zipCode: string) => {
    // Clear company filter and set zip code filter
    setSelectedCompany(null);
    setFilters({
      minPrice: 0,
      maxPrice: 10000000, // Default to max slider value
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: zipCode,
      city: undefined,
      county: 'San Diego', // Preserve default county
      statusFilters: ["in-renovation", "on-market", "sold"],
    });
    setSidebarView("none");
    setMapCenter(undefined);
    setMapZoom(12);
  };

  const handleLogoClick = () => {
    // Reset everything to default state (like first visit)
    setViewMode("map");
    setSidebarView("directory");
    setFilters({
      minPrice: 0,
      maxPrice: 10000000, // Default to max slider value
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      county: 'San Diego', // Reset to default San Diego county
      statusFilters: ['in-renovation'],
    });
    setSelectedCompany(null);
    setSelectedProperty(null);
    setMapCenter(undefined);
    setMapZoom(14);
    setSortBy("recently-sold");
  };

  const handleViewModeChange = (mode: "map" | "grid" | "table" | "buyers-feed") => {
    // Clear selected property when switching views to avoid modal popping up
    setSelectedProperty(null);
    setViewMode(mode);
  };

  // Fetch full property data by ID
  const fetchPropertyById = async (propertyId: string): Promise<Property | null> => {
    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error("Property not found");
          return null;
        }
        throw new Error(`Failed to fetch property: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error fetching property by ID:", error);
      return null;
    }
  };

  // Handle property selection by ID (for search suggestions)
  const handlePropertySelectById = async (propertyId: string) => {
    const property = await fetchPropertyById(propertyId);
    if (property) {
      setSelectedProperty(property);
      
      // If on map view, center on the property if it has coordinates
      if (viewMode === "map" && property.latitude && property.longitude) {
        setMapCenter([property.latitude, property.longitude]);
        setMapZoom(16);
      }
    }
  };

  // Handle map pin click - fetch full property data
  const handleMapPinClick = async (mapPin: MapPin) => {
    const property = await fetchPropertyById(mapPin.id);
    if (property) {
      setSelectedProperty(property);
    }
  };

  // Calculate total properties owned by selected company
  // For map view, count from mapPins. For grid/table views, use the API's total count
  // since the query already includes the company filter
  const totalCompanyProperties = useMemo(() => {
    if (!selectedCompany) return 0;
    if (viewMode === "map") {
      const companyNameNormalized = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
      return mapPins.filter(p => {
        const ownerName = (p.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
        return ownerName === companyNameNormalized;
      }).length;
    }
    // For grid/table views, use the API's total since the query includes the company filter
    return totalFilteredProperties;
  }, [mapPins, selectedCompany, viewMode, totalFilteredProperties]);

  // Properties are now sorted server-side, so we can use them directly
  // The API returns properties in the correct sorted order based on the sortBy parameter
  const sortedProperties = filteredProperties;

  // Calculate grid columns based on sidebar and property detail panel visibility
  const gridColsClass = useMemo(() => {
    const hasSidebar = sidebarView !== "none";
    const hasPropertyPanel = selectedProperty !== null;
    
    // Both sidebar and panel open - use 2 columns max
    if (hasSidebar && hasPropertyPanel) {
      return "grid-cols-1 md:grid-cols-2";
    }
    // Only sidebar OR panel open - use 2-3 columns
    if (hasSidebar || hasPropertyPanel) {
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3";
    }
    // Neither open - full 3 columns
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  }, [sidebarView, selectedProperty]);

  return (
    <div className="h-screen flex flex-col">
      <Header
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onPropertySelect={handlePropertySelectById}
        county={filters.county}
        onLoginClick={() => {
          // Header button click: user-initiated, so only force if already in forced state
          // If not forced yet, allow dismissable dialog
          setShowLoginDialog(true);
          setShowSignupDialog(false);
        }}
        onSignupClick={() => {
          // Header button click: user-initiated, so only force if already in forced state
          // If not forced yet (before 1 minute), allow dismissable dialog
          setShowSignupDialog(true);
          setShowLoginDialog(false);
        }}
        onLeaderboardClick={() => setShowLeaderboardDialog(true)}
        onBuyersFeedClick={() => setViewMode("buyers-feed")}
        onLogoClick={handleLogoClick}
      />

      <div className="flex-1 flex overflow-hidden">
        {sidebarView === "filters" && (
          <FilterSidebar
            onClose={() => setSidebarView("none")}
            onFilterChange={setFilters}
            filters={filters}
            zipCodesWithCounts={zipCodesWithCounts}
            onSwitchToDirectory={() => setSidebarView("directory")}
          />
        )}
        
        {sidebarView === "directory" && (
          <CompanyDirectory
            onClose={() => setSidebarView("none")}
            onSwitchToFilters={() => setSidebarView("filters")}
            onCompanySelect={handleCompanySelect}
            selectedCompany={selectedCompany}
            filters={filters}
            onFilterChange={setFilters}
          />
        )}

        <div className="flex-1 flex flex-col">
          {sidebarView === "none" && (
            <div className="p-2 border-b border-border flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarView("filters")}
                data-testid="button-show-filters"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarView("directory")}
                data-testid="button-show-directory"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Investor Profiles
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-hidden flex">
            {viewMode === "map" ? (
              <>
                {selectedProperty && (
                  <PropertyDetailPanel
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <div className="flex-1">
                  <PropertyMap
                    mapPins={filteredMapPins}
                    onPropertyClick={handleMapPinClick}
                    center={mapCenter}
                    zoom={mapZoom}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearAllFilters}
                    selectedProperty={selectedProperty}
                    isLoading={isLoadingMapPins}
                    selectedCompany={selectedCompany}
                    onDeselectCompany={() => {
                      setSelectedCompany(null);
                    }}
                  />
                </div>
              </>
            ) : viewMode === "table" ? (
              <TableView
                properties={sortedProperties}
                selectedCompany={selectedCompany}
                totalCompanyProperties={totalCompanyProperties}
                totalFilteredProperties={totalFilteredProperties}
                hasActiveFilters={hasActiveFilters}
                onPropertyClick={setSelectedProperty}
                onClearCompanyFilter={() => {
                  setSelectedCompany(null);
                }}
                onClearFilters={handleClearAllFilters}
                propertiesHasMore={propertiesHasMore}
                isLoadingMoreProperties={isLoadingMoreProperties}
                loadMoreRef={loadMorePropertiesRef}
              />
            ) : viewMode === "buyers-feed" ? (
              <>
                {selectedProperty && (
                  <PropertyDetailPanel
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <GridView
                  properties={sortedProperties}
                  selectedCompany={selectedCompany}
                  totalCompanyProperties={totalCompanyProperties}
                  totalFilteredProperties={totalFilteredProperties}
                  hasActiveFilters={hasActiveFilters}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onPropertyClick={setSelectedProperty}
                  onClearCompanyFilter={() => {
                    setSelectedCompany(null);
                  }}
                  onClearFilters={handleClearAllFilters}
                  gridColsClass={gridColsClass}
                  propertiesHasMore={propertiesHasMore}
                  isLoadingMoreProperties={isLoadingMoreProperties}
                  loadMoreRef={loadMorePropertiesRef}
                />
              </>
            ) : (
              <>
                {selectedProperty && (
                  <PropertyDetailPanel
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <GridView
                  properties={sortedProperties}
                  selectedCompany={selectedCompany}
                  totalCompanyProperties={totalCompanyProperties}
                  totalFilteredProperties={totalFilteredProperties}
                  hasActiveFilters={hasActiveFilters}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onPropertyClick={setSelectedProperty}
                  onClearCompanyFilter={() => {
                    setSelectedCompany(null);
                  }}
                  onClearFilters={handleClearAllFilters}
                  gridColsClass={gridColsClass}
                  propertiesHasMore={propertiesHasMore}
                  isLoadingMoreProperties={isLoadingMoreProperties}
                  loadMoreRef={loadMorePropertiesRef}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {viewMode === "table" && (
        <PropertyDetailModal
          property={selectedProperty}
          open={!!selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onCompanyNameClick={handleCompanyNameClick}
        />
      )}

      <UploadDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
      />

      <SignupDialog
        open={showSignupDialog}
        forced={isDialogForced}
        onClose={() => {
          // Only allow closing if not forced
          if (!isDialogForced) {
            setShowSignupDialog(false);
            dismissPrompt();
          }
        }}
        onSuccess={() => {
          setShowSignupDialog(false);
          setIsDialogForced(false);
          dismissPrompt();
        }}
        onSwitchToLogin={() => {
          // When switching, maintain forced state
          setShowSignupDialog(false);
          setShowLoginDialog(true);
        }}
      />

      <LoginDialog
        open={showLoginDialog}
        forced={isDialogForced}
        onClose={() => {
          // Only allow closing if not forced
          if (!isDialogForced) {
            setShowLoginDialog(false);
          }
        }}
        onSuccess={() => {
          setShowLoginDialog(false);
          setIsDialogForced(false);
        }}
        onSwitchToSignup={() => {
          // When switching, maintain forced state
          setShowLoginDialog(false);
          setShowSignupDialog(true);
        }}
      />

      <LeaderboardDialog
        open={showLeaderboardDialog}
        onOpenChange={setShowLeaderboardDialog}
        onCompanyClick={handleLeaderboardCompanyClick}
        onZipCodeClick={handleLeaderboardZipCodeClick}
      />

    </div>
  );
}
