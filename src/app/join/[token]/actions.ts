'use server'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export async function acceptInviteAction(token: string) {
  const user = await requireUser(`/join/${token}`)
  const shopId = await sql.begin(async tx => {
    const [inv] = await tx<{ id: string; shopId: string; role: 'staff' | 'manager'; staffId: string | null }[]>`
      select id, shop_id, role, staff_id from app.member_invites where token = ${token} and accepted_at is null for update
    `
    if (!inv) return null
    await tx`
      insert into app.shop_members (shop_id, user_id, role, staff_id) values (${inv.shopId}, ${user.id}, ${inv.role}, ${inv.staffId})
      on conflict (shop_id, user_id) do update set
        role = case when app.shop_members.role = 'owner' then 'owner' else excluded.role end,
        staff_id = coalesce(excluded.staff_id, app.shop_members.staff_id)
    `
    await tx`update app.member_invites set accepted_at = now(), email = ${user.email} where id = ${inv.id}`
    return inv.shopId
  })
  redirect(shopId ? `/dashboard/${shopId}/me` : `/join/${token}`)
}
