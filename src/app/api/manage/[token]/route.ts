import { z } from 'zod'
import { byToken, rescheduleByToken, cancelByToken, canCustomerChange, confirmByToken, BookingError } from '@/lib/bookings'
import { notifyWaitlist } from '@/lib/waitlistNotify'
import { loadCatalog, listStaff } from '@/lib/data/catalog'
import { availability, nextAvailable } from '@/lib/availability'
import { dateStr, minuteOfDay, uuid, trimOrNull } from '@/lib/validate'
import { json, errorResponse } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'
import { mailCustomer, mailShop } from '@/lib/email'
import { nowInZone, diffDays, addDays } from '@/lib/tz'
import type { GuestRequest } from '@/lib/engine'

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('availability'), from: dateStr, days: z.number().int().min(1).max(21), date: dateStr.nullable(), staffId: uuid.nullable().optional() }),
  z.object({ action: z.literal('reschedule'), date: dateStr, start: minuteOfDay, staffId: uuid.nullable().optional() }),
  z.object({ action: z.literal('cancel'), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('confirm') }),
])

export async function POST(req: Request, ctx: RouteContext<'/api/manage/[token]'>) {
  try {
    const { token } = await ctx.params
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid' }, 400)
    if (!(await allow('mg:' + (await clientKey()), 120, 60))) return json({ error: 'rate' }, 429)
    const found = await byToken(token)
    if (!found) return json({ error: 'not_found' }, 404)
    const { shop, group } = found
    const d = parsed.data

    if (d.action === 'availability') {
      const active = group.filter(b => b.status === 'confirmed')
      if (!active.length || active.some(b => !canCustomerChange(shop, b))) throw new BookingError('cutoff')
      const catalog = await loadCatalog(shop.id, { forCustomers: true })
      const guests: GuestRequest[] = active.map(b => ({
        serviceIds: (b.items ?? []).filter(i => i.kind === 'service').map(i => i.serviceId!).filter(Boolean),
        addonIds: (b.items ?? []).filter(i => i.kind === 'addon').map(i => i.serviceId!).filter(Boolean),
        staffId: b.anyStaff ? null : b.staffId,
      }))
      if (active.length === 1 && d.staffId !== undefined) guests[0].staffId = d.staffId
      const today = nowInZone(shop.timezone).date
      const from = diffDays(d.from, today) < 0 ? today : d.from
      const days = Math.max(1, Math.min(d.days, shop.maxDays + 1 - diffDays(from, today)))
      const ignore = active.map(b => b.id)
      const res = await availability(shop, catalog, guests, from, days, d.date, { forCustomers: true, ignore })
      let next: string | null = null
      if (d.date && !res.slots.length) {
        const start = addDays(d.date, 1)
        const left = shop.maxDays + 1 - diffDays(start, today)
        if (left > 0) next = await nextAvailable(shop, catalog, guests, start, left, { forCustomers: true, ignore })
      }
      return json({ days: res.days, slots: res.slots.map(s => ({ start: s.start, staff: s.assign.map(a => a.staffId) })), next })
    }

    if (d.action === 'confirm') {
      await confirmByToken(token)
      return json({ ok: true })
    }

    const staff = await listStaff(shop.id)
    if (d.action === 'reschedule') {
      const moved = await rescheduleByToken(token, d.date, d.start, active1(group) ? d.staffId : undefined)
      await Promise.all([mailCustomer('rescheduled', shop, moved, staff), mailShop('rescheduled', shop, moved, staff)])
      return json({ ok: true })
    }
    const reason = trimOrNull(d.reason, 500)
    const res = await cancelByToken(token, reason)
    const fresh = (await byToken(token))!.group.filter(b => res.group.some(g => g.id === b.id))
    await Promise.all([mailCustomer('cancelled', shop, fresh, staff, reason), mailShop('cancelled', shop, fresh, staff)])
    await notifyWaitlist(shop, fresh[0]?.date ?? group[0].date).catch(e => console.error('waitlist', e))
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}

function active1(group: { status: string }[]) {
  return group.filter(b => b.status === 'confirmed').length === 1
}
