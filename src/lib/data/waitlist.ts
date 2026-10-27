import 'server-only'
import { sql } from '../db'
import type { Shop, Lang } from '../types'

export type WaitlistEntry = {
  id: string; shopId: string; date: string; fromMin: number; toMin: number; serviceIds: string[]; addonIds: string[]
  staffId: string | null; name: string; phone: string | null; email: string; lang: Lang; status: 'waiting' | 'notified' | 'booked' | 'removed'
  notifiedAt: Date | null; createdAt: Date
}

export async function joinWaitlist(shop: Shop, d: Omit<WaitlistEntry, 'id' | 'shopId' | 'status' | 'notifiedAt' | 'createdAt'>) {
  // one entry per email per day: joining again just updates it
  const [row] = await sql<WaitlistEntry[]>`
    with gone as (
      update app.waitlist set status = 'removed' where shop_id = ${shop.id} and date = ${d.date} and lower(email) = lower(${d.email}) and status = 'waiting'
    )
    insert into app.waitlist (shop_id, date, from_min, to_min, service_ids, addon_ids, staff_id, name, phone, email, lang)
    values (${shop.id}, ${d.date}, ${d.fromMin}, ${d.toMin}, ${sql.array(d.serviceIds)}::uuid[], ${sql.array(d.addonIds)}::uuid[],
            ${d.staffId}, ${d.name}, ${d.phone}, ${d.email}, ${d.lang})
    returning *
  `
  return row
}

export async function listWaitlist(shopId: string, from: string): Promise<WaitlistEntry[]> {
  return sql<WaitlistEntry[]>`
    select * from app.waitlist where shop_id = ${shopId} and date >= ${from} and status in ('waiting', 'notified')
    order by date, from_min, created_at
  `
}

export async function waitingFor(shopId: string, date: string): Promise<WaitlistEntry[]> {
  return sql<WaitlistEntry[]>`
    select * from app.waitlist where shop_id = ${shopId} and date = ${date} and status = 'waiting' order by created_at
  `
}

export async function markWaitlist(shopId: string, id: string, status: WaitlistEntry['status']) {
  await sql`update app.waitlist set status = ${status}, notified_at = case when ${status} = 'notified' then now() else notified_at end
    where id = ${id} and shop_id = ${shopId}`
}
