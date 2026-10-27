import { z } from 'zod'
import { getShopBySlug } from '@/lib/data/shops'
import { loadCatalog } from '@/lib/data/catalog'
import { availability, nextAvailable } from '@/lib/availability'
import { guestsSchema, dateStr } from '@/lib/validate'
import { json, errorResponse } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'
import { nowInZone, diffDays, addDays } from '@/lib/tz'

const body = z.object({ guests: guestsSchema, from: dateStr, days: z.number().int().min(1).max(21), date: dateStr.nullable() })

export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/availability'>) {
  try {
    const { slug } = await ctx.params
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid' }, 400)
    if (!(await allow('av:' + (await clientKey()), 300, 60))) return json({ error: 'rate' }, 429)
    const shop = await getShopBySlug(slug)
    if (!shop || shop.status !== 'live') return json({ error: 'not_open' }, 403)
    const catalog = await loadCatalog(shop.id, { forCustomers: true })
    const { guests, date } = parsed.data
    const today = nowInZone(shop.timezone).date
    const from = diffDays(parsed.data.from, today) < 0 ? today : parsed.data.from
    const days = Math.max(1, Math.min(parsed.data.days, shop.maxDays + 1 - diffDays(from, today)))
    const res = await availability(shop, catalog, guests, from, days, date, { forCustomers: true })
    let next: string | null = null
    if (date && res.slots.length === 0) {
      const start = diffDays(date, today) < 0 ? today : addDays(date, 1)
      const left = shop.maxDays + 1 - diffDays(start, today)
      if (left > 0) next = await nextAvailable(shop, catalog, guests, start, left, { forCustomers: true })
    }
    return json({
      days: res.days,
      slots: res.slots.map(s => ({ start: s.start, staff: s.assign.map(a => a.staffId), minutes: s.assign.map(a => a.duration) })),
      next,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
