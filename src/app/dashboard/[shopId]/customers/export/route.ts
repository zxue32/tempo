import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listCustomers, isSegment } from '@/lib/data/crm'
import { audit } from '@/lib/audit'
import { sql } from '@/lib/db'
import { nowInZone } from '@/lib/tz'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // a leading = + - @ would run as a formula in a spreadsheet
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The client list as a CSV the shop can open in Excel or re-import (same columns the importer reads). */
export async function GET(req: Request, ctx: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await ctx.params
  const { user } = await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const url = new URL(req.url)
  const seg = url.searchParams.get('seg')
  const tag = url.searchParams.get('tag') ?? undefined
  const today = nowInZone(shop.timezone).date
  const rows = await listCustomers(shopId, today, '', 'name', 5000, { segment: isSegment(seg) ? seg : 'all', tag: tag || undefined })
  const header = ['name', 'phone', 'email', 'tags', 'birthday', 'notes', 'source', 'marketing_consent', 'visits', 'no_shows', 'last_visit', 'next_visit', 'client_since']
  const lines = [header.join(',')]
  for (const c of rows) {
    lines.push([c.name, c.phone, c.email, c.tags.join('; '), c.birthday, c.notes, c.source, c.marketingConsent ? 'yes' : 'no', c.visits, c.noShows, c.lastVisit, c.nextVisit, c.createdAt.toISOString().slice(0, 10)].map(cell).join(','))
  }
  await audit(sql, { shopId, actorUser: user.id, action: 'customer.export', targetType: 'shop', targetId: shopId, detail: { n: rows.length, seg, tag: tag ? true : false } })
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="clients-${today}.csv"`, 'Cache-Control': 'no-store' },
  })
}
