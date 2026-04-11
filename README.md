# Lenga Maps Platform

Africa's most centralized GIS data subscription platform. Browse, preview, and download professional-grade geospatial datasets covering all 54 African nations.

**Live:** [parallel-lenga-maps-website-coral.vercel.app](https://parallel-lenga-maps-website-coral.vercel.app)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| Auth & Database | Supabase (PostgreSQL + Auth + RLS) |
| File Storage | Cloudflare R2 (S3-compatible) |
| Hosting | Vercel |

## Features

- **12 GIS Datasets** — Admin boundaries, DEM, hydrology, land cover, rainfall, geology, vegetation, population, roads, wetlands, soils, protected areas
- **54 Countries** — Full Africa coverage with country-level file downloads
- **Presigned Downloads** — Secure, time-limited download URLs via Cloudflare R2
- **Dataset Explorer** — Browse datasets with descriptions, tips, and metadata
- **Accordion Boundaries** — Country-grouped admin boundary browser with expandable levels
- **Public Access** — Browse and download without authentication
- **Responsive** — Mobile-first design with dark theme

## Datasets

| Dataset | Source | Format |
|---------|--------|--------|
| Administrative Boundaries | GADM / OSM | Shapefile, GeoJSON, KML |
| Digital Elevation Model | SRTM / ALOS | GeoTIFF, ASCII Grid |
| River Networks & Watersheds | HydroSHEDS / FAO | Shapefile, GeoJSON |
| Land Use / Land Cover | ESA WorldCover | GeoTIFF |
| Rainfall & Climate | CHIRPS / WorldClim | NetCDF, GeoTIFF |
| Geology & Lithology | USGS / CGS | Shapefile, GeoJSON |
| Vegetation & NDVI | MODIS / Landsat | GeoTIFF, HDF |
| Population & Settlements | WorldPop / GPW | GeoTIFF, Shapefile |
| Roads & Infrastructure | OSM / GRIP | Shapefile, GeoJSON |
| Wetlands & Floodplains | GlobWetland / JRC | GeoTIFF, Shapefile |
| Soil Classification | ISRIC SoilGrids | GeoTIFF, NetCDF |
| Protected Areas & Wildlife | WDPA / IUCN | Shapefile, GeoJSON |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project (with admin_boundaries and hydrology tables)
- Cloudflare R2 bucket (with geodata files)

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CLOUDFLARE_R2_ACCOUNT_ID=your_r2_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_key
CLOUDFLARE_R2_BUCKET_NAME=your_bucket_name
```

### Run Locally

```bash
git clone https://github.com/mulengachilufya/parallel-lenga-maps-website.git
cd parallel-lenga-maps-website
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Screenshots

<!-- Add screenshots here -->
| Page | Preview |
|------|---------|
| Homepage | *screenshot* |
| Datasets Overview | *screenshot* |
| Download Portal | *screenshot* |

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes (boundaries, hydrology, files)
│   ├── dashboard/        # Download portal
│   ├── datasets/         # Dataset overview page
│   ├── login/            # Auth pages
│   └── page.tsx          # Homepage
├── components/           # Reusable UI components
└── lib/                  # Supabase client, dataset config
```

## License

MIT
