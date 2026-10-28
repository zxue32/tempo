import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff } from '@/lib/data/catalog'
import { searchBookings } from '@/lib/data/insights'
import { bookingFilters } from '@/lib/filters'
import { hhmm, nowInZone } from '@/lib/tz'
import { fromMinor } from '@/lib/money'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s
  return '"' + safe.replace(/"/g, '""') + '"'
}

export async function GET(req: Request, ctx: RouteContext<'/dashboard/[shopId]/bookings/export'>) {
  const { shopId } = await ctx.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const f = bookingFilters(sp, nowInZone(shop.timezone).date)
  const [staff, rows] = await Promise.all([listStaff(shopId), searchBookings(shopId, f, 10000)])
  const names = new Map(staff.map(s => [s.id, s.name]))
  const head = ['code', 'date', 'start', 'end', 'minutes', 'status', 'source', 'staff', 'any_staff', 'client', 'phone', 'email', 'services', 'est_price', 'client_notes', 'internal_note', 'created_at', 'currency']
  const lines = [head.map(cell).join(',')]
  for (const b of rows) {
    lines.push([
      b.code, b.date, hhmm(b.startMin), hhmm(b.endMin), b.durationMin, b.status, b.kind, names.get(b.staffId) ?? '', b.anyStaff ? 'yes' : '',
      b.guestName, b.guestPhone, b.guestEmail, (b.items ?? []).map(i => i.name).join(' + '),
      b.estPriceCents != null ? fromMinor(b.estPriceCents, shop.currency) : '', b.notes, b.internalNote, b.createdAt.toISOString(), shop.currency,
    ].map(cell).join(','))
  }
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${shop.slug}-bookings-${f.from}_${f.to}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
