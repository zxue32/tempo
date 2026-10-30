import 'server-only'
import { sql } from './db'
import { env } from './env'

// Pictures and who may see them (CORE-04). Shop pictures (gallery, team, logo, colour swatches) are public.
// What a customer sends with a booking — a reference photo, the 3D studio's design card — is private:
// only people who work at that shop (and platform admins) can open it.

const PATH = /^([a-z]+)\/([0-9a-f-]{36})\/[0-9a-f]{32}\.(jpg|png|webp)$/
const PUBLIC_KINDS = new Set(['gallery', 'staff', 'shop', 'palette'])

export type Viewer = { id: string; isAdmin: boolean } | null

/** The stored picture at `path` if this viewer may see it; null otherwise (also when it doesn't exist). */
export async function mediaFor(path: string, viewer: Viewer): Promise<{ mime: string; bytes: Buffer; private: boolean } | null> {
  if (!PATH.test(path)) return null
  const [row] = await sql<{ mime: string; bytes: Buffer; visibility: string; shopId: string | null }[]>`
    select mime, bytes, visibility, shop_id from app.media where path = ${path}
  `
  if (!row) return null
  const priv = row.visibility === 'private'
  if (priv) {
    if (!viewer || !row.shopId) return null
    if (!viewer.isAdmin) {
      const [m] = await sql`select 1 from app.shop_members where shop_id = ${row.shopId} and user_id = ${viewer.id}`
      if (!m) return null
    }
  }
  return { mime: row.mime, bytes: row.bytes, private: priv }
}

/** Kind and shop of one of our stored pictures, from its URL (database storage or the Supabase bucket). */
function ours(url: string): { kind: string; shopId: string } | null {
  let rel: string | null = null
  if (url.startsWith('/media/')) rel = url.slice('/media/'.length)
  else if (env.supabaseUrl) {
    const prefix = `${env.supabaseUrl}/storage/v1/object/public/${process.env.STORAGE_BUCKET || 'media'}/`
    if (url.startsWith(prefix)) rel = url.slice(prefix.length)
  }
  const m = rel ? PATH.exec(rel) : null
  return m ? { kind: m[1], shopId: m[2] } : null
}

/** A photo a customer attached to a booking at this shop: only this shop's own reference uploads qualify. */
export function refPhotoFor(url: string | null | undefined, shopId: string): string | null {
  if (!url) return null
  const o = ours(url)
  return o && o.kind === 'ref' && o.shopId === shopId ? url : null
}

/**
 * A picture the shop shows publicly (team photo, logo, cover, swatch). Its own public uploads, or a picture
 * hosted elsewhere; never a customer's private photo and never another shop's upload.
 */
export function publicImageFor(url: string | null | undefined, shopId: string): string | null {
  if (!url) return null
  const o = ours(url)
  if (o) return PUBLIC_KINDS.has(o.kind) && o.shopId === shopId ? url : null
  if (/\/media\/|\/storage\/v1\//.test(url)) return null
  return /^https:\/\/[^\s]+$/.test(url) ? url : null
}
