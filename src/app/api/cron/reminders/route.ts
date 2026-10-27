import { sql } from '@/lib/db'
import { mailCustomer, sendMail } from '@/lib/email'
import { integrityCheck } from '@/lib/data/pilot'
import { env, platformAdminEmails } from '@/lib/env'
import { bookingsWithItems } from '@/lib/bookings'
import { listStaff } from '@/lib/data/catalog'
import type { Booking, Shop } from '@/lib/types'

// Sends "see you tomorrow" emails. Call hourly with: Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })
  const due = await sql<Booking[]>`
    select b.* from app.bookings b join app.shops s on s.id = b.shop_id
    where b.status = 'confirmed' and b.reminder_sent_at is null and b.kind <> 'block'
      and b.guest_email is not null and b.manage_token is not null
      and b.starts_at between now() + interval '1 hour' and now() + interval '24 hours'
      and b.created_at < b.starts_at - interval '6 hours'
      and s.status = 'live'
    order by b.starts_at limit 200
  `
  let sent = 0
  for (const primary of due) {
    const claimed = await sql`update app.bookings set reminder_sent_at = now() where id = ${primary.id} and reminder_sent_at is null returning id`
    if (!claimed.length) continue
    const groupRows = primary.groupId
      ? await sql<Booking[]>`select * from app.bookings where group_id = ${primary.groupId} and status = 'confirmed' order by created_at, id`
      : [primary]
    if (primary.groupId) await sql`update app.bookings set reminder_sent_at = now() where group_id = ${primary.groupId}`
    const [shop] = await sql<Shop[]>`select * from app.shops where id = ${primary.shopId}`
    const group = await bookingsWithItems(groupRows)
    await mailCustomer('reminder', shop, group, await listStaff(shop.id))
    sent++
  }
  // once a day per live shop: re-check the stored bookings against the rules, and tell the platform admins about any error
  const dueShops = await sql<{ id: string; name: string }[]>`
    select s.id, s.name from app.shops s
    where s.status = 'live' and not exists (select 1 from app.integrity_runs r where r.shop_id = s.id and r.at > now() - interval '20 hours')
    limit 50
  `
  let checked = 0, failing = 0
  for (const sh of dueShops) {
    const res = await integrityCheck(sh.id)
    checked++
    if (!res.ok) {
      failing++
      const lines = res.issues.filter(i => i.level === 'error').map(i => `${i.code}: ${i.count}`)
      for (const to of platformAdminEmails()) {
        await sendMail({
          to, template: 'integrity', shopId: sh.id,
          subject: `[${env.platformName}] Integrity check failed: ${sh.name}`,
          text: `${sh.name}\n${lines.join('\n')}\n${env.siteUrl}/dashboard/${sh.id}/pilot`,
          html: `<p><b>${sh.name.replace(/[<>&]/g, '')}</b></p><p>${lines.join('<br>')}</p><p><a href="${env.siteUrl}/dashboard/${sh.id}/pilot">${env.siteUrl}/dashboard/${sh.id}/pilot</a></p>`,
        })
      }
    }
  }
  return Response.json({ sent, checked, failing })
}
