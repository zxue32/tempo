import 'server-only'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { createHash } from 'node:crypto'
import { sql } from './db'
import { devAuthEnabled, platformAdminEmails } from './env'
import { accountForToken } from './accounts'

export type SessionUser = { id: string; email: string; isAdmin: boolean }
export type Role = 'owner' | 'manager' | 'staff'
export const SESSION_COOKIE = 'tempo_session'

export function devUserId(email: string): string {
  const h = createHash('sha256').update('tempo-dev:' + email.toLowerCase()).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** The signed-in user (built-in email + password accounts; a cookie with a random session token). */
export async function getUser(): Promise<SessionUser | null> {
  const store = await cookies()
  if (devAuthEnabled()) {
    // local development only: any email signs in
    const email = store.get('dev_user')?.value?.toLowerCase()
    if (email && /^[^@\s]+@[^@\s]+$/.test(email)) {
      const id = devUserId(email)
      await sql`insert into app.users (id, email, last_seen_at) values (${id}, ${email}, now())
        on conflict (id) do update set last_seen_at = now()`
      return { id, email, isAdmin: platformAdminEmails().includes(email) }
    }
  }
  const acct = await accountForToken(store.get(SESSION_COOKIE)?.value)
  if (!acct) return null
  // admin needs both: the email on the platform list AND an account created with the setup code
  return { id: acct.id, email: acct.email, isAdmin: acct.platformAdmin && platformAdminEmails().includes(acct.email) }
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
  const rows = await sql<{ role: Role; staffId: string | null }[]>`
    select role, staff_id from app.shop_members where shop_id = ${shopId} and user_id = ${user.id}
  `
  if (rows[0]) return { role: rows[0].role, staffId: rows[0].staffId }
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
