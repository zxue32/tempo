import { getUser } from '@/lib/auth'
import { mediaFor } from '@/lib/media'

// Photos stored in the database (when no external storage is configured). Paths contain a random
// 128-bit name, so a URL never changes content: public pictures may be cached by browsers and the CDN
// for a year. Private pictures (what customers send with a booking) go only to people who work at that
// shop, and are never stored by the CDN (CORE-04).
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store' } })

export async function GET(_req: Request, ctx: RouteContext<'/media/[...path]'>) {
  const { path: parts } = await ctx.params
  const rel = parts.join('/')
  // only private pictures need to know who is asking
  const viewer = rel.startsWith('ref/') ? await getUser().catch(() => null) : null
  const row = await mediaFor(rel, viewer ? { id: viewer.id, isAdmin: viewer.isAdmin } : null)
  if (!row) return notFound()
  const cache: Record<string, string> = row.private
    ? { 'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store', Vary: 'Cookie' }
    : { 'Cache-Control': 'public, max-age=31536000, immutable', 'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable' }
  return new Response(new Uint8Array(row.bytes), {
    headers: { 'Content-Type': row.mime, 'Content-Length': String(row.bytes.length), 'X-Content-Type-Options': 'nosniff', ...cache },
  })
}
