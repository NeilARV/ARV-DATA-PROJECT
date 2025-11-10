# Design Guidelines: Property Listing Platform

## Design Approach
**System-Based with Redfin Inspiration**: Using Material Design principles adapted for real estate applications. Drawing from Redfin's clean, data-focused interface while maintaining systematic consistency for this property discovery and management tool.

## Core Design Principles
1. **Information Density**: Maximize scannable property data without clutter
2. **Dual-View Harmony**: Seamless transitions between map and grid layouts
3. **Data Hierarchy**: Price and key specs (beds/baths/sqft) immediately visible
4. **Professional Clarity**: Clean, trustworthy interface for real estate decisions

---

## Typography System

**Font Family**: Inter (via Google Fonts CDN) - excellent for data-dense interfaces

**Hierarchy**:
- Page Titles: 2xl, font-semibold (Property Listings, Upload Data)
- Property Prices: xl, font-bold (primary data point)
- Property Addresses: base, font-medium
- Property Specs: sm, font-normal (beds, baths, sqft labels)
- Secondary Info: sm, text-opacity-70
- Filter Labels: sm, font-medium
- Button Text: sm, font-medium

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4 or p-6
- Section spacing: space-y-4 or space-y-6
- Card gaps: gap-4
- Form field spacing: space-y-4

**Container Strategy**:
- Application wrapper: max-w-none (full-width for map)
- Sidebar/filters: w-80 (fixed width)
- Property cards: Responsive grid with fluid widths
- Modals: max-w-4xl

**Grid Systems**:
- Property Grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Filter Controls: Single column layout in sidebar
- Property Detail Modal: Two-column (image gallery + details)

---

## Component Library

### Navigation Header
- Fixed top bar with logo, view toggles (Map/Grid), upload button
- Height: h-16
- Search bar centered with autocomplete dropdown
- User account icon on far right
- Shadow: shadow-md for depth separation

### View Toggle Controls
- Segmented control for Map/Grid switching
- Icons from Heroicons (map-icon, grid-icon)
- Active state with solid background, inactive with subtle border

### Property Cards
- Aspect ratio 4:3 image at top
- Price as largest text element (xl, font-bold)
- Address below price (base, font-medium)
- Specs row: beds | baths | sqft with icons, evenly spaced
- Card padding: p-4
- Border: border with rounded-lg
- Hover: subtle shadow elevation (shadow-lg transition)

### Map Interface
- Full-height map container (calc(100vh - 4rem) accounting for header)
- Custom property markers with price callouts
- Cluster groups for multiple properties
- Selected property highlights with border treatment
- Info window on marker click with mini property card

### Filter Sidebar
- Collapsible panel on left (desktop) or drawer (mobile)
- Width: w-80 on desktop
- Filter sections with clear labels:
  - Price Range (dual-handle slider)
  - Bedrooms (button group: Any, 1+, 2+, 3+, 4+)
  - Bathrooms (button group: Any, 1+, 2+, 3+)
  - Property Type (checkboxes)
- Apply/Reset buttons at bottom
- Sticky positioning within scrollable content

### Upload Interface
- Drag-and-drop zone with dashed border (border-dashed border-2)
- Upload icon from Heroicons (cloud-arrow-up-icon)
- "Drag CSV file here or click to browse" messaging
- File requirements text (sm, text-opacity-60)
- Upload progress indicator
- Preview table of uploaded data before confirmation
- Padding: p-8 for spacious drop zone

### Property Detail Modal
- Overlay: backdrop with bg-opacity-50
- Modal: max-w-4xl, rounded-lg
- Left: Image gallery with thumbnails
- Right: Full property details in scrollable column
- Close button (x-mark-icon) in top-right
- Padding: p-6

### Form Elements
- Input fields: border, rounded-md, px-4 py-2
- Labels: font-medium, mb-2
- Focus states: ring-2 ring-offset-2
- File upload: Styled file input with custom trigger button
- Dropdowns: Consistent height with inputs

---

## Icons
**Library**: Heroicons (via CDN)
- Navigation: map-icon, squares-2x2-icon (grid)
- Property specs: home-icon, bed-icon (custom comment), bathtub-icon (custom comment)
- Actions: cloud-arrow-up-icon, magnifying-glass-icon, x-mark-icon, filter-icon
- Map: map-pin-icon, arrows-pointing-out-icon (expand)

---

## Images

**Hero Section**: Not applicable - this is a functional application, not a marketing site

**Property Images**:
- Main property photos in cards and detail views
- Aspect ratio: 4:3 for cards, flexible in detail modal
- Image gallery with 5-8 photos per property in modal
- Placeholder images for properties without photos (house icon centered)

**Where Images Appear**:
- Property card thumbnails (primary image)
- Map marker thumbnails (optional, on hover)
- Property detail modal gallery (all property photos)
- Upload preview (no images, data table only)

---

## Responsive Behavior

**Mobile (< 768px)**:
- Map view becomes primary, grid accessible via tab
- Filters in drawer overlay
- Property cards: Single column, full-width
- Bottom navigation with Map/List toggle

**Tablet (768px - 1024px)**:
- Side-by-side: narrow filter sidebar + map/grid
- Property grid: 2 columns

**Desktop (1024px+)**:
- Full three-panel layout: filters | content | (optional details panel)
- Property grid: 3 columns
- Map can split-screen with grid (50/50 or adjustable)

---

## Animations
- View transitions: Fade between map/grid (200ms)
- Card hover: Shadow elevation (150ms ease)
- Filter drawer: Slide-in from left (250ms)
- Modal: Fade + scale from center (200ms)
- NO scroll-triggered animations
- NO complex property card animations

---

## Key Interactions

**Map Markers**: Click to show info window, double-click to open detail modal
**Property Cards**: Click anywhere to open detail modal
**Filters**: Auto-apply on selection (no "Apply" button needed for most filters)
**Upload**: Drag-drop or click, immediate preview of parsed data
**View Toggle**: Instant switch between map and grid, maintaining filter state