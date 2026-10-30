import { z } from 'zod'
import { getShopBySlug } from '@/lib/data/shops'
import { createBooking, BookingError } from '@/lib/bookings'
import { listStaff } from '@/lib/data/catalog'
import { guestSchema, uuid, dateStr, minuteOfDay, emailRe, trimOrNull } from '@/lib/validate'
import { parsePhone } from '@/lib/phone'
import { refPhotoFor } from '@/lib/media'
import { marketOf } from '@/lib/markets'
import { json, errorResponse } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'
import { mailCustomer, mailShop } from '@/lib/email'
import { sql } from '@/lib/db'
import { recordFunnel } from '@/lib/data/pilot'
import { isNailDesign } from '@/components/NailArt'

// each guest may carry answers to the shop's intake form; they are checked against that form on the server (CORE-05)
const intake = z.object({ formId: uuid, answers: z.record(z.string().max(32), z.unknown()) }).nullable().optional()
const body = z.object({
  guests: z.array(guestSchema.extend({ intake })).min(1).max(10),
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
    // only a photo this customer uploaded to this shop; never another shop's picture (CORE-04)
    let photoUrl = refPhotoFor(d.photoUrl, shop.id)
    if (!photoUrl && d.lookId) {
      const [look] = await sql<{ url: string }[]>`select url from app.gallery where id = ${d.lookId} and shop_id = ${shop.id}`
      photoUrl = look?.url ?? null
    }
    const res = await createBooking({
      shop, mode: 'online', kind: 'online', date: d.date, start: d.start,
      guests: d.guests.map(({ serviceIds, addonIds, staffId }) => ({ serviceIds, addonIds, staffId })), intake: d.guests.map(g => g.intake ?? null),
      contact: { name: d.name, phone: d.phone, email: d.email.toLowerCase() },
      notes: trimOrNull(d.notes, 1000), photoUrl, lang: d.lang, design: isNailDesign(d.design) ? d.design : null,
    })
    if (d.session) await recordFunnel(shop.id, d.session, 'booked').catch(() => {})
    // someone on the waitlist who now booked that day no longer needs to wait
    await sql`update app.waitlist set status = 'booked' where shop_id = ${shop.id} and date = ${d.date} and lower(email) = ${d.email.toLowerCase()} and status in ('waiting', 'notified')`.catch(() => {})
    const staff = await listStaff(shop.id)
    // answers the shop still has to look at make this a request, not a confirmed booking
    await Promise.all([mailCustomer(res.review ? 'requested' : 'confirmed', shop, res.bookings, staff), mailShop('new', shop, res.bookings, staff)])
    return json({ token: res.token, code: res.code, review: res.review })
  } catch (e) {
    if (e instanceof BookingError) return errorResponse(e)
    return errorResponse(e)
  }
}
