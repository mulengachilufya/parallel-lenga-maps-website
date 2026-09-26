// src/lib/workspace/catalog.ts
import type { ApiFile } from '@/lib/api-datasets'

/** Human label that tells two files of the same country apart. */
export function fileVariant(f: ApiFile): string {
  const level = f.meta?.admin_level
  if (level !== undefined && level !== null && level !== '') return `ADM${level}`
  const base = f.r2_key.split('/').pop() ?? ''
  return base.replace(/\.(zip|gpkg|tif|tiff|geojson|json|shp)$/i, '').replace(/[_-]+/g, ' ')
}
