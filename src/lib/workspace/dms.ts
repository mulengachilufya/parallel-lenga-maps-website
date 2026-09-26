// src/lib/workspace/dms.ts
//
// Shared constants for workspace messaging and project voice notes.

export const VOICE_BUCKET = 'workspace-voice'
export const VOICE_MAX_BYTES = 4 * 1024 * 1024
export const VOICE_MAX_SECONDS = 300

/** Recorder output → the bare mime type the bucket allows, with a file extension. */
export const VOICE_TYPES: Record<string, string> = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
}

/** Don't email again while the recipient still hasn't read the last emailed
 *  message from this sender and it went out less than this long ago. */
export const EMAIL_QUIET_MS = 10 * 60 * 1000

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
