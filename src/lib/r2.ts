import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Cloudflare R2 client (S3-compatible)
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

/**
 * Generate a presigned URL for uploading a file to R2
 */
export async function getUploadUrl(key: string, contentType: string, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2, command, { expiresIn })
}

/**
 * Generate a presigned URL for downloading a file from R2
 */
export async function getDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return getSignedUrl(r2, command, { expiresIn })
}

/**
 * Delete a file from R2
 */
export async function deleteFile(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return r2.send(command)
}

/**
 * List files in R2 under a given prefix (folder)
 */
export async function listFiles(prefix: string, maxKeys = 100) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
  })
  const response = await r2.send(command)
  return response.Contents ?? []
}

/**
 * Build the R2 key path for a dataset file
 * Format: datasets/{country}/{layer_type}/{filename}
 */
export function buildFileKey(country: string, layerType: string, filename: string) {
  return `datasets/${country.toLowerCase()}/${layerType.toLowerCase()}/${filename}`
}

/**
 * Open an object for streaming (used by the workspace's same-origin proxy
 * when the browser can't fetch a presigned URL directly).
 */
export async function getObjectStream(key: string) {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return {
    body:          res.Body?.transformToWebStream() ?? null,
    contentLength: res.ContentLength ?? null,
    contentType:   res.ContentType ?? 'application/octet-stream',
  }
}
