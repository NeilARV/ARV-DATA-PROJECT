# Vendors App — Overview & Reference

## What It Is
The Vendors page is a two-panel community hub for renovation and real estate professionals. The left panel (480px) is an **Activity Feed** — a stream of community posts about renovation projects, flips, and property work. The right panel fills the remaining width with a **Browse by Category** vendor directory. On mobile, the two panels are tab-switched ("Browse" / "Activity Feed").

The feature serves two goals simultaneously:
1. Give users a place to discover vendors (contractors, plumbers, HVAC, etc.) organized by trade category
2. Let the community share project work, tag the vendors and categories involved, and surface those vendors naturally through real activity

---

## Page Entry Point
`client/src/pages/Vendors.tsx` — wraps `VendorsContent` in 5 context providers:
`MapProvider → FiltersProvider → CompaniesProvider → PropertiesProvider → PropertyProvider`

These providers are inherited from the rest of the app and not specific to Vendors — the page participates in the shared provider tree.

---

## Component Tree

```
VendorsContent
├── Header
├── Mobile Tab Bar (Browse / Activity Feed)
├── ActivityFeed (left panel, 480px)
│   ├── PostCard (repeating)
│   │   ├── Author + avatar + timestamp
│   │   ├── Formatted HTML content (vendor/category mentions are clickable)
│   │   ├── Image carousel (up to 5 images, ChevronLeft/Right, dot indicators)
│   │   ├── Edit/Delete menu (post author, admin, or owner only)
│   │   └── ImageLightbox (full-screen image preview)
│   └── PostComposer (auth required)
│       ├── TipTap rich text editor
│       │   ├── Formatting toolbar (Bold, Italic, Underline, Link, Font Size)
│       │   └── Mentions: @vendor → vendorMention, #category → categoryMention
│       ├── Image upload area (max 5 JPEG/PNG)
│       └── Post button
└── BrowseByCategory (right panel, flex-1)
    ├── Header with search, breadcrumbs, Add Vendor button (admin/owner)
    ├── RecommendedVendors section (isRecommended=true vendors)
    ├── View states (driven by useVendorNav):
    │   ├── categories — CategoryCard grid (all categories)
    │   ├── vendor-list — VendorCard grid (vendors in selected category)
    │   ├── vendor-detail — VendorDetail panel (full vendor profile)
    │   └── search — mixed CategoryCard + VendorCard results
    └── VendorDetail
        ├── Header image + logo
        ├── Name, description, contact info (address, phone, website)
        ├── Category badges
        ├── VendorPhotoGallery (post images featuring this vendor)
        ├── EditVendorDialog (admin/owner)
        └── DeleteConfirmation (admin/owner)
```

---

## State Management

### `useVendorNav` (URL-driven navigation)
Central hook for the vendor page. Manages view state via URL params to support browser back/forward.

```
State:
  view: "categories" | "vendor-list" | "vendor-detail"
  categoryId: number | null     ← ?category={id}
  vendorId: string | null       ← ?vendor={id}
  postFilters: { categoryId?, vendorId? }  ← passed to ActivityFeed

Actions:
  selectCategory(id)   → sets view="vendor-list", clears vendorId, updates URL
  selectVendor(id)     → sets view="vendor-detail", updates URL
  goBack()             → vendor selected → clear vendor; at categories → no-op
  reset()              → full reset, clears URL params
```

URL pattern: `/vendors?category=5&vendor=abc-123`

### Post editor state
Managed by `usePostEditor` hook inside `PostComposer`. Handles TipTap editor instance, mention extraction, image files, and submit state.

---

## API Surface

All calls use the `apiRequest()` wrapper with cookie-based auth.

### Categories
| Method | Route | Description |
|---|---|---|
| GET | `/api/categories` | All categories with vendor counts |
| GET | `/api/categories/:id/vendors` | Vendors in a given category |

### Vendors
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/vendors` | Public | All vendors; accepts `?categoryIds=` |
| GET | `/api/vendors/recommended` | Public | Vendors with `isRecommended=true` |
| GET | `/api/vendors/:id` | Public | Single vendor with categories |
| POST | `/api/vendors` | Admin/Owner | Create vendor |
| PUT | `/api/vendors/:id` | Admin/Owner | Update vendor |
| DELETE | `/api/vendors/:id` | Admin/Owner | Delete vendor |
| PUT | `/api/vendors/:id/recommend` | Admin/Owner | Toggle `isRecommended` |
| POST | `/api/vendors/:id/logo` | Admin/Owner | Upload logo (FormData) |
| DELETE | `/api/vendors/:id/logo` | Admin/Owner | Remove logo |
| POST | `/api/vendors/:id/header` | Admin/Owner | Upload header image (FormData) |
| DELETE | `/api/vendors/:id/header` | Admin/Owner | Remove header image |

### Posts
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/posts` | Public | Feed; accepts `?categoryId=`, `?vendorId=`, `?page=`, `?limit=` |
| POST | `/api/posts` | Auth required | Create post |
| PUT | `/api/posts/:id` | Author/Admin/Owner | Update post |
| DELETE | `/api/posts/:id` | Author/Admin/Owner | Delete post |
| POST | `/api/posts/:id/images` | Author | Upload image (FormData, max 5) |
| DELETE | `/api/posts/:id/images/:imageId` | Author/Admin/Owner | Delete image |

---

## Backend

### Services
- `server/services/vendors/vendors.services.ts` — CRUD, category mapping, Supabase image upload/delete
- `server/services/posts/posts.services.ts` — post CRUD, mention parsing, batch enrichment (likes, comments, images, tags), ownership checks
- `server/services/categories/categories.services.ts` — category list with vendor count aggregates

### Key service behavior
- `createPost` / `updatePost` parse vendor and category mentions out of TipTap HTML content and rebuild junction table records on every save
- Post enrichment (`getPosts`) fetches likes, comment counts, images, vendor tags, and user tags in parallel batch queries — never N+1
- `getAll` for vendors deduplicates results when filtering by multiple categories (a vendor in both categories appears once)
- Vendor and post image uploads go to Supabase Storage; the URL is stored in the DB. Deleting a vendor cleans up Supabase images

---

## Database Schema (`database/schemas/vendors.schema.ts`)

| Table | Key Columns | Notes |
|---|---|---|
| `categories` | id, name, slug, iconName, description | Shared by vendors and posts |
| `vendors` | id (uuid), name, logoUrl, headerUrl, isRecommended, userId (nullable FK) | Vendors don't require a registered account |
| `vendor_categories` | (vendorId, categoryId) | Many-to-many junction |
| `posts` | id (uuid), userId, title, content (HTML), address, city, state | Content stores TipTap HTML including mention marks |
| `post_categories` | (postId, categoryId) | Rebuilt on every post save |
| `post_images` | id, postId, imageUrl, displayOrder | Max 5 per post |
| `post_likes` | (userId, postId) | One like per user per post |
| `post_comments` | id, postId, userId, parentCommentId (nullable) | One level of threading |
| `post_vendor_tags` | (postId, vendorId) | Rebuilt on every post save from @mentions |
| `post_user_tags` | (postId, taggedUserId) | Rebuilt on every post save from @user mentions |

Deleting a vendor or post cascades to all related junction and child records.

---

## Access Control

| Action | Anyone | Authenticated | Admin / Owner |
|---|---|---|---|
| Browse vendors and categories | ✓ | ✓ | ✓ |
| Read posts / activity feed | ✓ | ✓ | ✓ |
| Create post | — | ✓ | ✓ |
| Edit own post | — | ✓ (own) | ✓ (any) |
| Delete own post | — | ✓ (own) | ✓ (any) |
| Create / edit / delete vendor | — | — | ✓ |
| Upload vendor logo / header | — | — | ✓ |
| Toggle vendor recommended | — | — | ✓ |

---

## Current State

### Fully implemented
- Vendor CRUD with logo and header image upload (Supabase)
- Vendor category tagging (many-to-many)
- Recommended vendors section
- Post creation with TipTap rich text editor
- `@vendor` and `#category` mention autocomplete in editor
- Post images (up to 5 per post, Supabase)
- Post edit and delete with ownership enforcement
- Activity feed filtering by selected category or vendor
- Vendor photo gallery (images from posts tagged with the vendor)
- Mobile-responsive two-panel layout with tab switching
- Search across categories and vendors in the browse panel
- Breadcrumb navigation with URL-driven state

### Implemented in schema/backend, not yet surfaced in UI
- Post likes (count fetched and returned, but no like button rendered in PostCard)
- Post comments (schema exists, comment count fetched, but no comment thread UI in PostCard)
- User tagging (`@user` mentions, postUserTags table exists, but autocomplete not wired in editor)
- Infinite scroll (pagination API supports it; UI currently uses query invalidation on new posts)

---

## Key Files

| Layer | Path |
|---|---|
| Page | `client/src/pages/Vendors.tsx` |
| API client | `client/src/api/vendors.api.ts` |
| Components | `client/src/components/vendors/` (14 files) |
| Nav hook | `client/src/hooks/useVendorNav.ts` |
| Post editor hook | `client/src/hooks/usePostEditor.ts` |
| Types | `client/src/types/vendors.d.ts` |
| Routes | `server/routes/vendors.routes.ts`, `posts.routes.ts`, `categories.routes.ts` |
| Controllers | `server/controllers/vendors/`, `server/controllers/posts/`, `server/controllers/categories/` |
| Services | `server/services/vendors/`, `server/services/posts/`, `server/services/categories/` |
| Schema | `database/schemas/vendors.schema.ts` |
| Validation | `database/validation/vendors.validation.ts` |
