import 'server-only'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { createHash } from 'node:crypto'
import { sql } from './db'
import { devAuthEnabled, platformAdminEmails } from './env'
import { supabaseServer, supabaseConfigured } from './supabase'

export type SessionUser = { id: string; email: string; isAdmin: boolean }
export type Role = 'owner' | 'manager' | 'staff'

export function devUserId(email: string): string {
  const h = createHash('sha256').update('tempo-dev:' + email.toLowerCase()).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

async function rawSessionUser(): Promise<{ id: string; email: string } | null> {
  if (devAuthEnabled()) {
    const email = (await cookies()).get('dev_user')?.value
    if (email && /^[^@\s]+@[^@\s]+$/.test(email)) return { id: devUserId(email), email: email.toLowerCase() }
    return null
  }
  if (!supabaseConfigured()) return null
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user?.email) return null
  return { id: data.user.id, email: data.user.email.toLowerCase() }
}

/** The signed-in user, mirrored into app.users. */
export async function getUser(): Promise<SessionUser | null> {
  const u = await rawSessionUser()
  if (!u) return null
  await sql`
    insert into app.users (id, email, last_seen_at) values (${u.id}, ${u.email}, now())
    on conflict (id) do update set email = excluded.email, last_seen_at = now()
  `
  await acceptPendingInvites(u.id, u.email)
  return { ...u, isAdmin: platformAdminEmails().includes(u.email) }
}

export async function requireUser(next = '/dashboard'): Promise<SessionUser> {
  const u = await getUser()
  if (!u) redirect('/login?next=' + encodeURIComponent(next))
  return u
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser('/admin')
  if (!u.isAdmin) notFound()
  return u
}

export type Membership = { role: Role | 'admin'; staffId: string | null }

export async function membership(shopId: string, user: SessionUser): Promise<Membership | null> {
  const rows = await sql<{ role: Role; staff_id: string | null }[]>`
    select role, staff_id from app.shop_members where shop_id = ${shopId} and user_id = ${user.id}
  `
  if (rows[0]) return { role: rows[0].role, staffId: rows[0].staff_id }
  if (user.isAdmin) return { role: 'admin', staffId: null }
  return null
}

/** Ensures the user can work on this shop. `level` = minimum role. */
export async function requireShop(shopId: string, level: 'staff' | 'manager' | 'owner' = 'manager') {
  const user = await requireUser('/dashboard')
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) notFound()
  const m = await membership(shopId, user)
  if (!m) notFound()
  const rank = { staff: 1, manager: 2, owner: 3, admin: 4 } as const
  if (rank[m.role] < rank[level]) notFound()
  return { user, member: m }
}

async function acceptPendingInvites(userId: string, email: string) {
  const invites = await sql<{ id: string; shop_id: string; role: Role; staff_id: string | null }[]>`
    select id, shop_id, role, staff_id from app.member_invites
    where lower(email) = ${email} and accepted_at is null
  `
  for (const inv of invites) {
    await sql.begin(async tx => {
      await tx`
        insert into app.shop_members (shop_id, user_id, role, staff_id)
        values (${inv.shop_id}, ${userId}, ${inv.role}, ${inv.staff_id})
        on conflict (shop_id, user_id) do update set
          role = case when app.shop_members.role = 'owner' then 'owner' else excluded.role end,
          staff_id = coalesce(excluded.staff_id, app.shop_members.staff_id)
      `
      await tx`update app.member_invites set accepted_at = now() where id = ${inv.id}`
    })
  }
}
