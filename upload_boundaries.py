#!/usr/bin/env python3
"""
Upload administrative boundary files to Cloudflare R2
"""
import os
import sys
import zipfile
from pathlib import Path
from dotenv import load_dotenv
import boto3

# Load environment variables from .env.local
load_dotenv('.env.local')

# Get R2 credentials
ACCOUNT_ID = os.getenv('CLOUDFLARE_R2_ACCOUNT_ID')
ACCESS_KEY = os.getenv('CLOUDFLARE_R2_ACCESS_KEY_ID')
SECRET_KEY = os.getenv('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
BUCKET = os.getenv('CLOUDFLARE_R2_BUCKET_NAME', 'gis-data-lenga-maps')

if not all([ACCOUNT_ID, ACCESS_KEY, SECRET_KEY]):
    print("❌ Missing R2 credentials in .env.local")
    sys.exit(1)

# Initialize S3 client for R2
s3_client = boto3.client(
    's3',
    endpoint_url=f'https://{ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name='auto'
)

# Find and extract the zip file
downloads = Path.home() / 'Downloads'
zip_file = None
for f in downloads.glob('*Administrative*Boundaries*.zip'):
    zip_file = f
    break

if not zip_file:
    print("❌ No Administrative Boundaries zip file found in Downloads")
    sys.exit(1)

print(f"📦 Found: {zip_file}")

# Extract to temp location
extract_dir = downloads / 'admin-boundaries-temp'
extract_dir.mkdir(exist_ok=True)

print(f"📂 Extracting main zip to {extract_dir}...")
with zipfile.ZipFile(zip_file, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)

# Extract all nested zip files (country-level zips)
print("📂 Extracting nested country zip files...")
nested_zips = list(extract_dir.rglob('*.zip'))
for nested_zip in nested_zips:
    print(f"   Extracting {nested_zip.name}...")
    try:
        with zipfile.ZipFile(nested_zip, 'r') as zip_ref:
            zip_ref.extractall(nested_zip.parent)
    except Exception as e:
        print(f"   ⚠️  Could not extract {nested_zip.name}: {e}")

# Find all geodata files
files_to_upload = []
for ext in ['*.geojson', '*.shp', '*.dbf', '*.shx', '*.prj', '*.gpkg', '*.gdb']:
    files_to_upload.extend(extract_dir.rglob(ext))

if not files_to_upload:
    print("❌ No geodata files found (looking for .geojson, .shp, .gpkg, etc.)")
    sys.exit(1)

print(f"📊 Found {len(files_to_upload)} files to upload")

# Upload each file
for file_path in files_to_upload:
    # Build R2 key: datasets/{relative_path}
    rel_path = file_path.relative_to(extract_dir)
    r2_key = f'datasets/{rel_path}'.replace('\\', '/')

    print(f"⬆️  Uploading {rel_path} → {r2_key}")

    try:
        s3_client.upload_file(
            str(file_path),
            BUCKET,
            r2_key,
            ExtraArgs={'ACL': 'private'}
        )
        print(f"   ✅ Success")
    except Exception as e:
        print(f"   ❌ Failed: {e}")

print("\n✨ Upload complete!")
print(f"Files available in R2 bucket: {BUCKET}/datasets/")

# Cleanup
import shutil
shutil.rmtree(extract_dir)
print("🧹 Cleaned up temporary files")
