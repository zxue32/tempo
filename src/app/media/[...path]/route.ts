import { sql } from '@/lib/db'

// Photos stored in the database (when no external storage is configured). Paths contain a random
// 128-bit name, so a URL never changes content: browsers and the CDN may cache it for a year.
export async function GET(_req: Request, ctx: RouteContext<'/media/[...path]'>) {
  const { path: parts } = await ctx.params
  const rel = parts.join('/')
  if (!/^[a-z]+\/[0-9a-f-]+\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(rel)) return new Response('Not found', { status: 404 })
  const [row] = await sql<{ mime: string; bytes: Buffer }[]>`select mime, bytes from app.media where path = ${rel}`
  if (!row) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } })
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(row.bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
