import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Serves locally stored uploads in development only (production uses Supabase Storage).
export async function GET(_req: Request, ctx: RouteContext<'/media/[...path]'>) {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 })
  const { path: parts } = await ctx.params
  const rel = parts.join('/')
  if (!/^[a-z0-9/_-]+\.(jpg|png|webp)$/i.test(rel) || rel.includes('..')) return new Response('Not found', { status: 404 })
  try {
    const buf = await readFile(path.join(process.cwd(), '.uploads', rel))
    const type = rel.endsWith('.png') ? 'image/png' : rel.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
