import 'server-only'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from './env'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

export class UploadError extends Error {}

function sniff(buf: Uint8Array): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp'
  return null
}

/**
 * Stores an image and returns its public URL.
 * Production: Supabase Storage bucket (SUPABASE_SECRET_KEY + STORAGE_BUCKET, default "media").
 * Local development without Supabase: files under .uploads/, served by /media/[...path].
 */
export async function storeImage(file: File, folder: string): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('too_large')
  const buf = new Uint8Array(await file.arrayBuffer())
  const type = sniff(buf)
  if (!type) throw new UploadError('bad_type')
  const name = `${folder.replace(/[^a-z0-9/_-]/gi, '')}/${randomBytes(16).toString('hex')}.${TYPES[type]}`
  // New-style secret keys (sb_secret_…) go in the apikey header only; legacy service_role JWTs also as Bearer.
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.STORAGE_BUCKET || 'media'
  if (env.supabaseUrl && service) {
    const auth: Record<string, string> = service.startsWith('sb_') ? { apikey: service } : { apikey: service, Authorization: `Bearer ${service}` }
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${bucket}/${name}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': type, 'x-upsert': 'false', 'cache-control': 'max-age=31536000' },
      body: buf,
    })
    if (!res.ok) throw new UploadError('storage ' + res.status)
    return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${name}`
  }
  if (process.env.NODE_ENV === 'production') throw new UploadError('storage_not_configured')
  const dir = path.join(process.cwd(), '.uploads', path.dirname(name))
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(process.cwd(), '.uploads', name), buf)
  return `/media/${name}`
}
