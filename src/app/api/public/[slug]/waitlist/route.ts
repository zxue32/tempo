import { z } from 'zod'
import { getShopBySlug } from '@/lib/data/shops'
import { loadCatalog } from '@/lib/data/catalog'
import { joinWaitlist } from '@/lib/data/waitlist'
import { dateStr, minuteOfDay, uuid, emailRe, phoneDigits } from '@/lib/validate'
import { json, errorResponse } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'
import { nowInZone, diffDays } from '@/lib/tz'

const body = z.object({
  date: dateStr,
  fromMin: minuteOfDay,
  toMin: minuteOfDay,
  serviceIds: z.array(uuid).min(1).max(6),
  addonIds: z.array(uuid).max(10),
  staffId: uuid.nullable(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(120),
  lang: z.enum(['zh', 'en']),
  website: z.string().optional(),
})

export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/waitlist'>) {
  try {
    const { slug } = await ctx.params
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid', detail: parsed.error.issues[0]?.path.join('.') }, 400)
    const d = parsed.data
    if (d.website) return json({ error: 'invalid' }, 400)
    if (!emailRe.test(d.email)) return json({ error: 'invalid', detail: 'email' }, 400)
    if (d.phone && phoneDigits(d.phone).length < 10) return json({ error: 'invalid', detail: 'phone' }, 400)
    if (!(d.toMin > d.fromMin)) return json({ error: 'invalid', detail: 'time' }, 400)
    const shop = await getShopBySlug(slug)
    if (!shop || shop.status !== 'live' || !shop.waitlistEnabled) return json({ error: 'not_open' }, 403)
    if (!(await allow('wl:' + (await clientKey()), 10, 3600))) return json({ error: 'rate' }, 429)
    const today = nowInZone(shop.timezone).date
    if (diffDays(d.date, today) < 0 || diffDays(d.date, today) > shop.maxDays) return json({ error: 'invalid', detail: 'date' }, 400)
    const catalog = await loadCatalog(shop.id, { forCustomers: true })
    const known = new Set(catalog.services.map(s => s.id))
    if (![...d.serviceIds, ...d.addonIds].every(id => known.has(id))) return json({ error: 'service_gone' }, 409)
    if (d.staffId && !catalog.staff.some(s => s.id === d.staffId && s.bookableOnline)) return json({ error: 'invalid', detail: 'staff' }, 400)
    await joinWaitlist(shop, { ...d, phone: d.phone || null, email: d.email.toLowerCase() })
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
