/**
 * Limits for files teams upload into a project (shared by the browser and
 * the API, so both say the same thing).
 *
 * Files up to WHOLE_FILE_MAX are opened whole in the browser. Larger ones
 * (up to MAX_UPLOAD_BYTES) must be GeoTIFFs the map can stream: tiled, with
 * overviews (a Cloud Optimized GeoTIFF) and in EPSG:4326.
 */

export const MAX_UPLOAD_BYTES = 400 * 1024 * 1024
export const PROJECT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024
export const WHOLE_FILE_MAX = 300 * 1024 * 1024

/** R2 folder for team uploads: <prefix>/<org_id>/<project_id>/<random>-<filename> */
export const UPLOAD_PREFIX = 'workspace-uploads'

export function formatBytes(n: number): string {
  if (n <= 0) return '0 MB'
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}
