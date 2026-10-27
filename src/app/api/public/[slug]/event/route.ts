import { z } from 'zod'
import { getShopBySlug } from '@/lib/data/shops'
import { recordFunnel, FUNNEL_STEPS } from '@/lib/data/pilot'
import { allow, clientKey } from '@/lib/ratelimit'

// Anonymous funnel step: no cookies, no personal data, one row per visit and step.
const body = z.object({ session: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/), step: z.enum(FUNNEL_STEPS) })

export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/event'>) {
  const { slug } = await ctx.params
  const text = await req.text().catch(() => '')
  let data: unknown = null
  try { data = JSON.parse(text) } catch { /* ignore */ }
  const parsed = body.safeParse(data)
  if (!parsed.success || parsed.data.step === 'booked') return new Response(null, { status: 204 })
  if (!(await allow('ev:' + (await clientKey()), 120, 600))) return new Response(null, { status: 204 })
  const shop = await getShopBySlug(slug)
  if (shop && shop.status === 'live') await recordFunnel(shop.id, parsed.data.session, parsed.data.step).catch(() => {})
  return new Response(null, { status: 204 })
}
