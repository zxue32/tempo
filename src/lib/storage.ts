import 'server-only'
import { randomBytes } from 'node:crypto'
import { env } from './env'
import { sql } from './db'

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
 * Stores an image and returns its URL.
 * With SUPABASE_URL + SUPABASE_SECRET_KEY: Supabase Storage (public bucket STORAGE_BUCKET, default "media").
 * Otherwise: the database (app.media), served by /media/<path> with long-lived caching.
 * `folder` is "<kind>/<shopId>", e.g. "gallery/0b6c…".
 */
export async function storeImage(file: File, folder: string): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('too_large')
  const buf = new Uint8Array(await file.arrayBuffer())
  const type = sniff(buf)
  if (!type) throw new UploadError('bad_type')
  const cleanFolder = folder.toLowerCase().replace(/[^a-z0-9/-]/g, '')
  if (!/^[a-z]+\/[0-9a-f-]+$/.test(cleanFolder)) throw new UploadError('bad_folder')
  const name = `${cleanFolder}/${randomBytes(16).toString('hex')}.${TYPES[type]}`
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.STORAGE_BUCKET || 'media'
  if (env.supabaseUrl && service) {
    // new-style secret keys (sb_secret_…) go in the apikey header only; legacy service_role JWTs also as Bearer
    const auth: Record<string, string> = service.startsWith('sb_') ? { apikey: service } : { apikey: service, Authorization: `Bearer ${service}` }
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${bucket}/${name}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': type, 'x-upsert': 'false', 'cache-control': 'max-age=31536000' },
      body: buf,
    })
    if (!res.ok) throw new UploadError('storage ' + res.status)
    return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${name}`
  }
  const shopId = cleanFolder.split('/')[1]
  await sql`
    insert into app.media (path, shop_id, mime, size, bytes)
    values (${name}, (select id from app.shops where id::text = ${shopId}), ${type}, ${buf.length}, ${Buffer.from(buf)})
  `
  return `/media/${name}`
}
