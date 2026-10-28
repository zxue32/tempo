import { z } from 'zod'
import { getShopBySlug } from '@/lib/data/shops'
import { createBooking, BookingError } from '@/lib/bookings'
import { listStaff } from '@/lib/data/catalog'
import { guestsSchema, dateStr, minuteOfDay, emailRe, trimOrNull } from '@/lib/validate'
import { parsePhone } from '@/lib/phone'
import { marketOf } from '@/lib/markets'
import { json, errorResponse } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'
import { mailCustomer, mailShop } from '@/lib/email'
import { env } from '@/lib/env'
import { sql } from '@/lib/db'
import { recordFunnel } from '@/lib/data/pilot'
import { isNailDesign } from '@/components/NailArt'

const body = z.object({
  guests: guestsSchema,
  date: dateStr,
  start: minuteOfDay,
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(120),
  notes: z.string().max(1000).optional().default(''),
  photoUrl: z.string().max(500).nullable().optional(),
  lang: z.enum(['zh', 'en']),
  website: z.string().optional(), // honeypot: real people never fill this
  lookId: z.string().uuid().nullable().optional(), // "book this look" from the gallery
  design: z.unknown().optional(),                   // "design your nails"; validated below
  session: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).optional(),
})

function ownPhoto(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('/media/ref/')) return url
  if (env.supabaseUrl && url.startsWith(`${env.supabaseUrl}/storage/v1/object/public/`)) return url
  return null
}

export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/bookings'>) {
  try {
    const { slug } = await ctx.params
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid', detail: parsed.error.issues[0]?.path.join('.') }, 400)
    const d = parsed.data
    if (d.website) return json({ error: 'invalid' }, 400)
    if (!emailRe.test(d.email)) return json({ error: 'invalid', detail: 'email' }, 400)
    const shop = await getShopBySlug(slug)
    if (!shop) return json({ error: 'not_found' }, 404)
    // a number without a country code is read in the shop's own region (CORE-03)
    if (!parsePhone(d.phone, marketOf(shop).phoneRegion)) return json({ error: 'invalid', detail: 'phone' }, 400)
    const ip = await clientKey()
    if (!(await allow(`bk:${shop.id}:${ip}`, 8, 3600)) || !(await allow(`bk:${ip}`, 20, 3600))) return json({ error: 'rate' }, 429)
    let photoUrl = ownPhoto(d.photoUrl)
    if (!photoUrl && d.lookId) {
      const [look] = await sql<{ url: string }[]>`select url from app.gallery where id = ${d.lookId} and shop_id = ${shop.id}`
      photoUrl = look?.url ?? null
    }
    const res = await createBooking({
      shop, mode: 'online', kind: 'online', date: d.date, start: d.start, guests: d.guests,
      contact: { name: d.name, phone: d.phone, email: d.email.toLowerCase() },
      notes: trimOrNull(d.notes, 1000), photoUrl, lang: d.lang, design: isNailDesign(d.design) ? d.design : null,
    })
    if (d.session) await recordFunnel(shop.id, d.session, 'booked').catch(() => {})
    // someone on the waitlist who now booked that day no longer needs to wait
    await sql`update app.waitlist set status = 'booked' where shop_id = ${shop.id} and date = ${d.date} and lower(email) = ${d.email.toLowerCase()} and status in ('waiting', 'notified')`.catch(() => {})
    const staff = await listStaff(shop.id)
    await Promise.all([mailCustomer('confirmed', shop, res.bookings, staff), mailShop('new', shop, res.bookings, staff)])
    return json({ token: res.token, code: res.code })
  } catch (e) {
    if (e instanceof BookingError) return errorResponse(e)
    return errorResponse(e)
  }
}
