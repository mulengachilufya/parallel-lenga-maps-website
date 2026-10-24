import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
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
export async function getDownloadUrl(key: string, expiresIn = 3600, downloadAs?: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    // With a file name the browser saves the file instead of opening it
    // (PDFs would otherwise open in a tab and never land in Downloads).
    ...(downloadAs ? { ResponseContentDisposition: `attachment; filename="${downloadAs.replace(/["\\\r\n]/g, '_')}"` } : {}),
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
export async function getObjectStream(key: string, range?: string | null) {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: range || undefined }))
  return {
    body:          res.Body?.transformToWebStream() ?? null,
    contentLength: res.ContentLength ?? null,
    contentType:   res.ContentType ?? 'application/octet-stream',
    contentRange:  res.ContentRange ?? null,
  }
}

/** True if the object exists (a cheap HEAD). */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

/**
 * Presigned PUT for a browser upload of exactly `size` bytes: the length is
 * part of the signature, so the file cannot be bigger than was approved.
 */
export async function getSizedUploadUrl(key: string, size: number, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentLength: size, ContentType: 'application/octet-stream',
  })
  return getSignedUrl(r2, command, { expiresIn, signableHeaders: new Set(['content-length', 'content-type']) })
}

/** Size of an object in bytes, or null if it does not exist. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const res = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return res.ContentLength ?? 0
  } catch {
    return null
  }
}

/** Server-side copy within the bucket. */
export async function copyObject(from: string, to: string) {
  return r2.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${encodeURIComponent(from).replace(/%2F/g, '/')}`, Key: to }))
}

/** Delete everything under a prefix (e.g. a team's upload folder). */
export async function deletePrefix(prefix: string) {
  let token: string | undefined
  do {
    const page = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }))
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
    if (keys.length) await r2.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys, Quiet: true } }))
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
}

/** Whole object as bytes (server-side processing of dataset files). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  if (!res.Body) throw new Error(`empty object ${key}`)
  return res.Body.transformToByteArray()
}

/** Write bytes to a key (server-side; overwrites). */
export async function putObjectBytes(key: string, bytes: Uint8Array, contentType = 'application/octet-stream') {
  return r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType }))
}
