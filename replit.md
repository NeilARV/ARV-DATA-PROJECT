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

**State Management**
- TanStack Query (React Query) for server state management and data fetching
- Local component state for UI interactions
- No global state management library (relying on React Query's cache)

**Key Features**
- Interactive map view using Leaflet for geospatial property visualization
- Grid view with responsive card layouts
- Advanced filtering sidebar (price range, bedrooms, bathrooms, property types, zip codes)
- CSV/Excel file upload with client-side parsing (PapaParse, XLSX)
- Property detail modal and side panel views
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

**Geocoding Integration**
- OpenStreetMap Nominatim API for address-to-coordinates conversion
- Free service, no API key required
- Automatic geocoding on property creation
- Fallback handling for failed geocoding attempts

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
- **OpenStreetMap Nominatim** - Free geocoding service for address-to-coordinate conversion
  - No authentication required
  - Rate-limited but sufficient for typical usage
  - Fallback strategy needed for production scale

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

### Development Tools
- **Replit Plugins** - Runtime error modal, cartographer, dev banner
- **PostCSS & Autoprefixer** - CSS processing pipeline
- **TailwindCSS** - Utility-first CSS framework

### Type Safety
- **Zod** - Schema validation and type inference
- **TypeScript** - Static type checking across entire stack
- **Drizzle Zod** - Automatic Zod schema generation from database schema