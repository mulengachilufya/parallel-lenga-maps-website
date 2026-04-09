# Admin Boundaries Integration - Final Steps

## Status
✅ Schema created in Supabase
✅ Seed script written
✅ API endpoint created
✅ Dashboard component updated

## Next: Run the Seed Script

### Step 1: Add Service Role Key to `.env.local`

Get your Supabase Service Role Key:
1. Go to Supabase Dashboard → Project Settings → API
2. Copy the **Service Role** key (keep it secret!)
3. Add to `.env.local`:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Step 2: Run the Seed Script

```bash
cd C:\Users\Muleng Chilufy\Documents\lenga-maps-platform
npx ts-node scripts/seed-admin-boundaries.ts
```

This will:
- List all files in R2 (datasets/ folder)
- Parse filenames to extract country and admin level
- Insert metadata into Supabase `admin_boundaries` table
- Show a summary by country

Expected output:
```
🌍 Starting admin boundaries seed...
📦 Found XXX files in R2
✅ Parsed XXX admin boundary files
📊 Summary by country:
   Zambia: 4 boundaries
   Angola: 4 boundaries
   ...
✨ Successfully seeded XXX admin boundaries!
```

### Step 3: Test Locally

Start dev server:
```bash
npm run dev
```

Visit: `http://localhost:3000/dashboard`

You should see:
- ✅ A table of admin boundaries from your R2 files
- ✅ Filters by country and admin level
- ✅ Download buttons with presigned URLs
- ✅ File sizes and geometry types

### Step 4: Deploy to Vercel

Push to GitHub:
```bash
git add -A
git commit -m "feat: add admin boundaries integration with Supabase + R2"
git push origin main
```

Vercel auto-deploys. Then set environment variables in Vercel Dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`

Then redeploy from Vercel dashboard.

## Architecture

```
User Browser
    ↓
/dashboard (Next.js Page)
    ↓
AdminBoundariesList Component (React)
    ↓
GET /api/admin-boundaries (Next.js API Route)
    ↓
Supabase (Query admin_boundaries table)
    ↓
R2 (GetDownloadUrl for presigned URLs)
    ↓
User downloads .geojson / .shp files
```

## Files Created/Modified

| File | Type | Purpose |
|------|------|---------|
| `scripts/seed-admin-boundaries.ts` | NEW | Populate Supabase from R2 files |
| `src/app/api/admin-boundaries/route.ts` | NEW | List boundaries API endpoint |
| `src/components/AdminBoundariesList.tsx` | NEW | Table UI with filters & downloads |
| `src/app/dashboard/page.tsx` | MODIFIED | Swapped datasets for boundaries |
| `.env.local` | MODIFIED | Add SUPABASE_SERVICE_ROLE_KEY |
| Supabase Dashboard | MODIFIED | Created `admin_boundaries` table |

## Verification Checklist

- [ ] Supabase table `admin_boundaries` created with proper schema
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added to `.env.local`
- [ ] Seed script runs without errors
- [ ] Dashboard loads without 401 errors
- [ ] Admin boundaries display with filters working
- [ ] Download button opens file (presigned URL works)
- [ ] All environment variables set in Vercel
- [ ] Live site deployed and tested

## Troubleshooting

**"401 Unauthorized" error:**
- Check that user is logged in
- Verify `createServerSupabase()` is getting correct session

**"No boundaries found":**
- Run seed script again: `npx ts-node scripts/seed-admin-boundaries.ts`
- Check R2 bucket exists and has files in `datasets/` folder

**Download fails:**
- Verify R2 credentials are correct in `.env.local`
- Check R2 file paths exist and are accessible

**API returns empty array:**
- Check Supabase `admin_boundaries` table has rows
- Verify query params are correct: `?country=zambia`

---

**All done!** Your admin boundaries are now live on the dashboard. 🎉
