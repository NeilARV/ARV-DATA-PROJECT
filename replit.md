# ARV DATA - Property Listing Platform

## Overview

A real estate property listing platform built with React, Express, and PostgreSQL. The application provides dual-view property browsing (map and grid layouts), interactive filtering, CSV/Excel data upload capabilities, and company contact management. Designed with a clean, data-focused interface inspired by Redfin's approach to real estate applications. Branded as "ARV DATA" with custom logo.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tool**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Wouter for lightweight client-side routing (single-page application pattern)

**UI Component System**
- shadcn/ui component library (Radix UI primitives with Tailwind CSS styling)
- "New York" style variant with custom design tokens
- Material Design principles adapted for real estate data density
- Inter font family for optimal data-dense interfaces
- Custom CSS variables system for theming with dark mode support
- ARV DATA brand colors:
  - Primary brand blue: #69C9E1 (RGB: 105, 201, 225 / HSL: 192 67% 65%)
  - Primary text/dark: #231F20 (RGB: 35, 31, 32)
  - Light gray: #EAEAEA (RGB: 234, 234, 234)
  - White: #FFFFFF

**State Management**
- TanStack Query (React Query) for server state management and data fetching
- Local component state for UI interactions
- No global state management library (relying on React Query's cache)

**Key Features**
- Interactive map view using Leaflet for geospatial property visualization
- Grid view with responsive card layouts
- Advanced filtering sidebar (price range, bedrooms, bathrooms, property types, zip codes)
- **Data Upload Methods**:
  - CSV/Excel file upload with client-side parsing (PapaParse, XLSX)
    - Automatic Excel serial date conversion to ISO strings
    - Intelligent field recognition for property data
    - Batch geocoding with Google Maps API
  - Manual property entry form (tabbed interface)
    - Complete form with all required and optional fields
    - Smart numeric field handling (no snap-to-zero during editing)
    - Required field validation on submit
    - Optional geocoding integration
- Property sorting options:
  - Recently Sold (newest first)
  - Days Held (longest ownership duration first)
  - Price: High to Low
  - Price: Low to High
- Property detail modal and side panel views with Google Street View integration
- Company directory with contact request functionality
  - Searchable directory of 258 company contacts
  - Property count display per company
  - Sorting options (alphabetical, most/fewest properties)
  - "Request Contact Information" feature
    - mailto: link to neil@arvfinance.com
    - "Copy Email" button as reliable fallback
    - Form collects requester name, email, and optional message
- Theme toggle (light/dark mode with localStorage persistence)

### Backend Architecture

**Server Framework**
- Express.js with TypeScript for RESTful API
- ESM module system throughout
- Custom logging middleware for request/response tracking

**API Design**
- RESTful endpoints under `/api` namespace
- JSON request/response format
- Primary endpoints:
  - `GET /api/properties` - Fetch all properties
  - `POST /api/properties` - Create single property (with geocoding)
  - `POST /api/properties/bulk` - Bulk property upload
  - `GET /api/company-contacts` - Fetch company contacts
  - `POST /api/properties/cleanup-geocoding` - Fix properties with fallback coordinates
  - `POST /api/properties/cleanup-dates` - Convert Excel serial dates to ISO strings
  - `GET /api/streetview` - Proxy Google Street View images

**Geocoding Integration**
- **Google Maps Geocoding API** for accurate address-to-coordinates conversion (replaced OpenStreetMap Nov 2025)
- Uses existing GOOGLE_API_KEY environment variable
- Automatic geocoding on property creation
- **No fallback coordinates** - properties that fail geocoding are rejected from upload with clear error messages
- Cleanup endpoint available at `POST /api/properties/cleanup-geocoding` to fix legacy bad coordinates
- Note: Requires Geocoding API to be enabled in Google Cloud Console

### Data Storage

**Database**
- PostgreSQL as primary database
- Neon serverless PostgreSQL for cloud hosting
- Connection via `@neondatabase/serverless` HTTP driver

**ORM & Schema Management**
- Drizzle ORM for type-safe database queries
- Schema-first approach with TypeScript inference
- Drizzle Kit for migrations and schema management

**Data Models**

*Properties Table*
- Core fields: address, city, state, zipCode, price, bedrooms, bathrooms, squareFeet
- Geospatial: latitude, longitude (required for map functionality)
- Metadata: propertyType, imageUrl, description, yearBuilt
- Ownership: propertyOwner, companyContactName, companyContactEmail
- Transaction: purchasePrice, dateSold

*Company Contacts Table*
- Normalized company contact information
- Fields: companyName (unique), contactName, contactEmail
- Seeded on server startup from embedded data

**Schema Validation**
- Zod schemas generated from Drizzle tables via `drizzle-zod`
- Runtime validation for API inputs
- Type safety across client-server boundary

### Development & Deployment

**Development Environment**
- TypeScript compilation checking (noEmit mode)
- Vite dev server with HMR
- Express server running in parallel
- Replit-specific plugins for error overlays and cartography

**Build Process**
- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles server code to `dist/index.js`
- ESM output format with external package references
- Production mode serves static files from build output

**Configuration Files**
- `vite.config.ts` - Frontend build, dev server, path aliases
- `tsconfig.json` - TypeScript compiler options, path mappings
- `tailwind.config.ts` - Design system tokens, theme configuration
- `drizzle.config.ts` - Database connection and migration settings

## External Dependencies

### Third-Party APIs
- **Google Maps Geocoding API** - Professional geocoding service for accurate address-to-coordinate conversion
  - Uses GOOGLE_API_KEY environment variable
  - Requires Geocoding API enabled in Google Cloud Console
  - Highly accurate results, no fallback strategy needed
  - Same API key also powers Street View integration

### Database Services
- **Neon Serverless PostgreSQL** - Cloud-hosted database
  - HTTP-based connection via `@neondatabase/serverless`
  - Requires `DATABASE_URL` environment variable
  - Auto-scaling serverless architecture

### UI Libraries
- **Radix UI** - Unstyled, accessible component primitives (dialogs, dropdowns, sliders, etc.)
- **Leaflet** - Interactive mapping library with tile layers
- **React Leaflet** - React bindings for Leaflet
- **Lucide React** - Icon library for UI elements

### Data Processing
- **PapaParse** - CSV parsing library for file uploads
- **XLSX** - Excel file reading/writing library
- **date-fns** - Date formatting and manipulation
- Custom date utilities (`client/src/lib/dateUtils.ts`) - Converts Excel serial dates to ISO strings during upload

### Development Tools
- **Replit Plugins** - Runtime error modal, cartographer, dev banner
- **PostCSS & Autoprefixer** - CSS processing pipeline
- **TailwindCSS** - Utility-first CSS framework

### Type Safety
- **Zod** - Schema validation and type inference
- **TypeScript** - Static type checking across entire stack
- **Drizzle Zod** - Automatic Zod schema generation from database schema