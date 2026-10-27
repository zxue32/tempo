import 'server-only'
import { env } from './env'
import { loadCatalog } from './data/catalog'
import { availability } from './availability'
import { waitingFor, markWaitlist } from './data/waitlist'
import { mailWaitlist } from './email'
import { addDays, nowInZone } from './tz'
import type { Shop } from './types'

/**
 * After a cancellation: tell the first few people waiting for that day whose request now fits.
 * First come, first served; at most 3 emails per freed spot so the list isn't spammed.
 */
export async function notifyWaitlist(shop: Shop, date: string, max = 3): Promise<number> {
  if (!shop.waitlistEnabled || shop.status !== 'live') return 0
  const today = nowInZone(shop.timezone).date
  if (date < today || date > addDays(today, shop.maxDays)) return 0
  const waiting = await waitingFor(shop.id, date)
  if (!waiting.length) return 0
  const catalog = await loadCatalog(shop.id, { forCustomers: true })
  let sent = 0
  for (const w of waiting) {
    if (sent >= max) break
    const guests = [{ serviceIds: w.serviceIds, addonIds: w.addonIds, staffId: w.staffId }]
    if (guests[0].serviceIds.some(id => !catalog.services.some(s => s.id === id))) continue
    const { slots } = await availability(shop, catalog, guests, date, 1, date, { forCustomers: true })
    const times = slots.map(s => s.start).filter(m => m >= w.fromMin && m < w.toMin)
    if (!times.length) continue
    const qs = new URLSearchParams({ date, service: w.serviceIds.join(','), ...(w.addonIds.length ? { addons: w.addonIds.join(',') } : {}), ...(w.staffId ? { staff: w.staffId } : {}) })
    await mailWaitlist(shop, w, times, `${env.siteUrl}/${shop.slug}/book?${qs}`)
    await markWaitlist(shop.id, w.id, 'notified')
    sent++
  }
  return sent
}
