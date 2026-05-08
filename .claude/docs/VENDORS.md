# Vendors & Community Feature — Design Document

## Overview

A new **Vendors** page that serves as a community hub for renovation professionals. Users can browse vendors by trade category, post about their renovation and flipping projects, tag vendors and collaborators, and discover new service providers. The goal is to build a lightweight social platform layered on top of the existing ARV Data application — giving the community a place to share project work while surfacing the vendors who made it happen.

---

## Goals

- Let users post about renovation projects, staging jobs, flips, and anything related to real estate investment
- Allow users to browse vendors (contractors, plumbers, roofers, HVAC, etc.) organized by trade category
- Connect posts to vendors via tagging so users can discover vendors through real project work
- Build a foundation that can grow into a richer social feature over time (profiles, followers, ratings, etc.)

---

## Technical Challenges

### 1. Route Namespace
The existing API lives entirely under `/api/*` (e.g. `/api/properties`, `/api/companies`). Adding vendor and post routes to the same flat namespace risks collision and makes the API harder to reason about as the app grows.

**Decision:** Keep all existing data routes as-is (no rename). New routes get their own namespaces: `/api/vendors/*`, `/api/posts/*`, `/api/categories`. This avoids breaking every frontend fetch call while still achieving clear separation for new features.

### 2. Image Storage
No object storage is currently configured. Profile images for users and project images for posts require a storage solution. NeonDB is Postgres-only and does not provide file/object storage.

**Decision:** Defer image upload support entirely. Use styled placeholder `div` elements in the UI where images will eventually appear. When storage is ready (Supabase Storage is the leading candidate), swap placeholders for `<img>` tags — no structural UI changes needed.

### 3. Database Separation
The new community feature adds 10 new tables that are logically separate from the property data pipeline. They should not be mixed into existing schema files.

**Decision:** All new tables live in `database/schemas/vendors.schema.ts`. Relations are appended to the existing `relations.schema.ts` under a clearly marked section header.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Route structure | Keep `/api/*` as-is, add `/api/vendors/*` and `/api/posts/*` | Zero regression risk, clean namespace for new feature |
| Image storage | Deferred — placeholder UI | Avoids blocking feature work on infrastructure setup |
| Storage provider (future) | Supabase Storage | Simple API, generous free tier, no additional cloud account required |
| Categories | Shared `categories` table for both vendors and posts | Single source of truth; filtering posts and vendors by same category creates natural connections |
| Post categories | Many-to-many (`post_categories` junction) | A project can span multiple trades (e.g. Roofing + HVAC) |
| Vendor entry | Manual via Neon SQL console (no create/update API) | Keeps scope tight for initial launch; no public vendor submission needed yet |
| Migration strategy | Switch from `db:push` to `db:generate` + `db:migrate` | Production apps benefit from auditable migration history; feature branch is the right moment to make the switch |

---

## Database Schema

All new tables live in `database/schemas/vendors.schema.ts`. The existing `users` table gains one new nullable column.

### New Tables

```
categories
  id            serial PK
  name          text unique not null
  slug          varchar(100) unique not null
  description   text
  icon_name     varchar(100) not null        -- maps to Lucide icon name on frontend
  created_at    timestamptz
  updated_at    timestamptz

vendors
  id            uuid PK
  name          text not null
  description   text
  address       text
  city          text
  state         varchar(2)
  zip_code      varchar(10)
  phone         text
  website       text
  user_id       uuid → users.id (nullable, set null on delete)
  created_at    timestamptz
  updated_at    timestamptz

vendor_categories                            -- many-to-many
  vendor_id     uuid → vendors.id (cascade)
  category_id   int  → categories.id (cascade)
  created_at    timestamptz
  PK (vendor_id, category_id)

posts
  id            uuid PK
  user_id       uuid → users.id (cascade)
  title         text not null
  content       text not null
  address       text
  city          text
  state         varchar(2)
  created_at    timestamptz
  updated_at    timestamptz

post_categories                              -- many-to-many
  post_id       uuid → posts.id (cascade)
  category_id   int  → categories.id (cascade)
  created_at    timestamptz
  PK (post_id, category_id)

post_images                                  -- placeholder until storage configured
  id            serial PK
  post_id       uuid → posts.id (cascade)
  image_url     text not null
  display_order int default 1
  created_at    timestamptz

post_likes                                   -- one like per user per post
  user_id       uuid → users.id (cascade)
  post_id       uuid → posts.id (cascade)
  created_at    timestamptz
  PK (user_id, post_id)

post_comments                                -- threaded via parent_comment_id
  id                uuid PK
  post_id           uuid → posts.id (cascade)
  user_id           uuid → users.id (cascade)
  parent_comment_id uuid → post_comments.id (nullable, cascade)
  content           text not null
  created_at        timestamptz
  updated_at        timestamptz

post_vendor_tags                             -- vendors tagged in a post
  post_id       uuid → posts.id (cascade)
  vendor_id     uuid → vendors.id (cascade)
  created_at    timestamptz
  PK (post_id, vendor_id)

post_user_tags                               -- users tagged as collaborators in a post
  post_id           uuid → posts.id (cascade)
  tagged_user_id    uuid → users.id (cascade)
  created_at        timestamptz
  PK (post_id, tagged_user_id)
```

### Existing Table Changes

```
users
  + profile_image_url   text (nullable)     -- added for future profile image support
```

### Seeded Categories

| Name | Slug | Icon |
|---|---|---|
| General Contractor | general-contractor | hammer |
| Plumber | plumber | wrench |
| Electrician | electrician | zap |
| Roofer | roofer | house |
| HVAC | hvac | thermometer |
| Home Stager | home-stager | layout-dashboard |
| Wholesaler | wholesaler | handshake |
| Painter | painter | paintbrush |
| Flooring | flooring | layers |
| Landscaping | landscaping | tree-pine |

Icon names are stored as Lucide kebab-case strings in the DB. The frontend maps them to Lucide components dynamically.

---

## API Routes

### Unchanged (existing data app routes stay as-is)
All existing `/api/properties`, `/api/companies`, `/api/geocoding`, `/api/deals`, `/api/admin` routes are untouched.

### Shared Routes (no change)
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/register` | Register |
| GET | `/api/auth/me` | Current session user |
| GET | `/api/users` | List users (admin) |
| DELETE | `/api/users/:userId` | Delete user (admin) |
| GET | `/api/users/:userId/subscription-tier` | Get subscription tier |
| POST | `/api/contact` | Contact form submission |

### New — Categories
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/categories` | All categories (feeds left panel cards) |
| GET | `/api/categories/:id/vendors` | Vendors in a given category |

### New — Vendors
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/vendors` | List vendors, optional `?categoryId=` filter |
| GET | `/api/vendors/:id` | Single vendor with categories |

No create/update/delete routes — vendors are entered directly via the Neon SQL console.

### New — Posts
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/posts` | Paginated post feed. Accepts `?categoryId=`, `?vendorId=`, `?userId=`, `?page=`, `?limit=` |
| POST | `/api/posts` | Create a post (auth required) |
| GET | `/api/posts/:id` | Single post with comments and tags |
| PUT | `/api/posts/:id` | Update post (owner only) |
| DELETE | `/api/posts/:id` | Delete post (owner or admin) |
| POST | `/api/posts/:id/likes` | Like a post (auth required, idempotent) |
| DELETE | `/api/posts/:id/likes` | Unlike a post (auth required) |
| GET | `/api/posts/:id/comments` | Threaded comments for a post |
| POST | `/api/posts/:id/comments` | Add comment, optional `parent_comment_id` for replies (auth required) |
| PUT | `/api/posts/:id/comments/:commentId` | Edit comment (owner only) |
| DELETE | `/api/posts/:id/comments/:commentId` | Delete comment (owner or admin) |

---

## UI Design

### Layout
The Vendors page reuses the existing `Header.tsx`. Below the header is a **two-panel split layout**:

- **Left panel (1/3 width):** Navigation — categories, vendor list, or vendor detail
- **Right panel (2/3 width):** Post feed — filtered based on left panel selection

### Left Panel — View States

**Default (categories view)**
Category cards in a grid. Each card shows:
- Lucide icon mapped from `icon_name`
- Category name (e.g. "General Contractor")
- Short description (e.g. "Full-service renovation & rehab")

Clicking a category card navigates to the vendor list view for that category.

**Vendor List view**
A list of vendor cards for the selected category. Each card shows:
- Vendor name
- Description
- City, state
- Category badges

Clicking a vendor filters the right panel post feed to posts tagged with that vendor.

**Navigation: Back button + breadcrumbs**

Breadcrumbs appear above the left panel content whenever the user is deeper than the default view:

| State | Breadcrumbs |
|---|---|
| Categories (default) | *(none)* |
| Category selected | `← Back` &nbsp;&nbsp; `Categories` |
| Vendor selected | `← Back` &nbsp;&nbsp; `Categories > {Category Name} Vendors` |

Each breadcrumb segment is clickable and navigates back to the view it represents.

### Right Panel — Post Feed

- **Default:** All posts, newest first
- **Category selected:** Posts filtered to that category
- **Vendor selected:** Posts filtered to posts tagged with that vendor
- **No results:** "No Posts Available" empty state

Post cards show: title, author name, date, content preview, category badges, vendor tags, like count, comment count, and a placeholder image slot (styled `div` with `ImageIcon` until storage is wired up).

A "New Post" button lives in the right panel header, auth-gated. Opens a `CreatePostDialog` with:
- Title (required)
- Content (required)
- Address / City / State (optional)
- Multi-select categories
- Vendor tag search
- User tag search
- Image placeholder section with "Image upload coming soon" label

---

## Frontend State Management

### `useVendorNav` Hook
Central hook for the vendor page. Prevents prop drilling across the left/right panels.

**State:**
```ts
view:              'categories' | 'vendor-list'
selectedCategory:  Category | null
selectedVendor:    Vendor | null
```

**Derived (computed, not stored):**
```ts
breadcrumbs: { label: string; action: () => void }[]
```

**Actions:**
```ts
selectCategory(category: Category)    // sets view='vendor-list', clears selectedVendor
selectVendor(vendor: Vendor)          // sets selectedVendor, view stays 'vendor-list'
goBack()                              // if vendor selected: clear vendor; else: reset to categories
navigateToBreadcrumb(index: number)   // jump to a specific breadcrumb level
reset()                               // full reset to default state
```

### Supporting Hooks
| Hook | Purpose |
|---|---|
| `useCategories()` | Fetch all categories for the left panel cards |
| `useVendors(categoryId?)` | Fetch vendors, re-fetches when categoryId changes |
| `usePosts(filters)` | Fetch posts with `{ categoryId?, vendorId? }` composition |

---

## Implementation Plan (Commit-by-Commit)

### Phase 1 — Database Foundation
| Commit | Work |
|---|---|
| 1 | Add all new Drizzle schemas (`vendors.schema.ts`), update `users.schema.ts` with `profile_image_url`, update `relations.schema.ts`, run `db:generate` + `db:migrate` |
| 2 | Add categories to `seed.ts`, run `db:seed` |

### Phase 2 — Backend: Categories & Vendors
| Commit | Work |
|---|---|
| 3 | `GET /api/categories` and `GET /api/categories/:id/vendors` |
| 4 | `GET /api/vendors` and `GET /api/vendors/:id` |

### Phase 3 — Backend: Posts
| Commit | Work |
|---|---|
| 5 | Posts CRUD — `GET`, `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| 6 | Post interactions — likes and comments endpoints |
| 7 | API route tests for vendors and posts |

### Phase 4 — Frontend Foundation
| Commit | Work |
|---|---|
| 8 | `/vendors` route in Wouter + Header nav link + two-panel page shell |
| 9 | TypeScript types for `Category`, `Vendor`, `Post`, `PostComment` |
| 10 | `useVendorNav`, `useCategories`, `useVendors`, `usePosts` hooks |

### Phase 5 — Frontend: Left Panel
| Commit | Work |
|---|---|
| 11 | `CategoryCard` component + left panel default (categories grid) |
| 12 | `VendorCard` component + vendor list view + `Breadcrumb` component + back button |

### Phase 6 — Frontend: Right Panel
| Commit | Work |
|---|---|
| 13 | `PostCard` component (with image placeholder slot) + `PostFeed` + "No Posts Available" empty state |
| 14 | Wire `useVendorNav` state into `PostFeed` for reactive filtering |

### Phase 7 — Post Creation & Interactions
| Commit | Work |
|---|---|
| 15 | `CreatePostDialog` — form with title, content, address, category multi-select, vendor/user tag search |
| 16 | Like button (optimistic update) + `CommentSection` with threaded reply support |

### Phase 8 — Polish & Ship
| Commit | Work |
|---|---|
| 17 | Responsive layout audit, mobile stacking behavior, all empty states reviewed |
| 18 | `npm run check` clean pass, remove debug logs, verify `data-testid` coverage |
| 19 | Merge to main |

---

## Future Considerations (Out of Scope for V1)

- Image upload via Supabase Storage (profile images + post images)
- Vendor claim flow — let a registered user link their account to a vendor profile
- Vendor ratings / reviews
- Post search
- User profile pages showing their posts
- Follower / following system
- Vendor create/edit UI (currently admin-only via Neon console)
- Admin-managed category list UI
