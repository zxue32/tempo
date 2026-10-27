import 'server-only'
import { sql } from './db'
import { hashPassword, verifyPassword, newToken, tokenHash, sameSecret } from './password'
import { platformAdminEmails } from './env'

export const SESSION_DAYS = 30
export const RESET_HOURS = 24

export class AccountError extends Error {
  constructor(public code: 'bad_email' | 'weak_password' | 'exists' | 'bad_login' | 'disabled' | 'needs_setup_code' | 'bad_token') { super(code) }
}

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 120
export const normEmail = (e: string) => e.trim().toLowerCase()

/**
 * New account. An email listed in PLATFORM_ADMIN_EMAILS can only be registered with the platform
 * setup code, so nobody can claim the admin's address first.
 */
export async function createAccount(input: { email: string; password: string; setupCode?: string | null; lang?: 'zh' | 'en' }) {
  const email = normEmail(input.email)
  if (!emailOk(email)) throw new AccountError('bad_email')
  if (input.password.length < 8 || input.password.length > 200) throw new AccountError('weak_password')
  let admin = false
  if (platformAdminEmails().includes(email)) {
    const code = process.env.ADMIN_SETUP_CODE || ''
    if (!code || !input.setupCode || !sameSecret(input.setupCode.trim(), code)) throw new AccountError('needs_setup_code')
    admin = true
  }
  const hash = await hashPassword(input.password)
  const rows = await sql<{ id: string }[]>`
    insert into app.users (email, password_hash, lang, platform_admin)
    values (${email}, ${hash}, ${input.lang ?? 'zh'}, ${admin})
    on conflict ((lower(email))) do nothing
    returning id
  `
  if (!rows[0]) throw new AccountError('exists')
  return { id: rows[0].id, email }
}

export async function checkLogin(emailRaw: string, password: string) {
  const email = normEmail(emailRaw)
  const [u] = await sql<{ id: string; passwordHash: string | null; disabled: boolean }[]>`
    select id, password_hash, disabled from app.users where lower(email) = ${email}
  `
  const ok = await verifyPassword(password, u?.passwordHash)
  if (!u || !ok) throw new AccountError('bad_login')
  if (u.disabled) throw new AccountError('disabled')
  return { id: u.id, email }
}

export async function startSession(userId: string, userAgent: string | null): Promise<string> {
  const token = newToken()
  await sql`
    insert into app.sessions (token_hash, user_id, expires_at, user_agent)
    values (${tokenHash(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}), ${userAgent?.slice(0, 200) ?? null})
  `
  if (Math.random() < 0.05) await sql`delete from app.sessions where expires_at < now()`
  return token
}

export type SessionAccount = { id: string; email: string; platformAdmin: boolean }

export async function accountForToken(token: string | undefined | null): Promise<SessionAccount | null> {
  if (!token || token.length < 30 || token.length > 100) return null
  const [row] = await sql<(SessionAccount & { lastSeenAt: Date })[]>`
    select u.id, u.email, u.platform_admin, s.last_seen_at from app.sessions s join app.users u on u.id = s.user_id
    where s.token_hash = ${tokenHash(token)} and s.expires_at > now() and not u.disabled
  `
  if (!row) return null
  if (Date.now() - row.lastSeenAt.getTime() > 3600_000) {
    await sql`update app.sessions set last_seen_at = now(), expires_at = now() + make_interval(days => ${SESSION_DAYS}) where token_hash = ${tokenHash(token)}`
    await sql`update app.users set last_seen_at = now() where id = ${row.id}`
  }
  return { id: row.id, email: row.email.toLowerCase(), platformAdmin: row.platformAdmin }
}

export async function endSession(token: string | undefined | null) {
  if (token) await sql`delete from app.sessions where token_hash = ${tokenHash(token)}`
}

/** Single-use password reset link, valid for RESET_HOURS. */
export async function createResetToken(userId: string, createdBy: string | null): Promise<string> {
  const token = newToken()
  await sql`update app.auth_tokens set used_at = now() where user_id = ${userId} and purpose = 'reset' and used_at is null`
  await sql`
    insert into app.auth_tokens (token_hash, user_id, purpose, created_by, expires_at)
    values (${tokenHash(token)}, ${userId}, 'reset', ${createdBy}, now() + make_interval(hours => ${RESET_HOURS}))
  `
  return token
}

export async function resetTokenAccount(token: string): Promise<{ userId: string; email: string } | null> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null
  const [row] = await sql<{ userId: string; email: string }[]>`
    select t.user_id, u.email from app.auth_tokens t join app.users u on u.id = t.user_id
    where t.token_hash = ${tokenHash(token)} and t.purpose = 'reset' and t.used_at is null and t.expires_at > now()
  `
  return row ?? null
}

/** Sets a new password from a reset link and signs out every other browser. */
export async function useResetToken(token: string, password: string): Promise<string> {
  if (password.length < 8 || password.length > 200) throw new AccountError('weak_password')
  const acct = await resetTokenAccount(token)
  if (!acct) throw new AccountError('bad_token')
  const hash = await hashPassword(password)
  const used = await sql`update app.auth_tokens set used_at = now() where token_hash = ${tokenHash(token)} and used_at is null returning user_id`
  if (!used.length) throw new AccountError('bad_token')
  await sql`update app.users set password_hash = ${hash}, email_verified_at = coalesce(email_verified_at, now()) where id = ${acct.userId}`
  await sql`delete from app.sessions where user_id = ${acct.userId}`
  return acct.userId
}

export async function changePassword(userId: string, current: string, next: string) {
  if (next.length < 8 || next.length > 200) throw new AccountError('weak_password')
  const [u] = await sql<{ passwordHash: string | null }[]>`select password_hash from app.users where id = ${userId}`
  if (!(await verifyPassword(current, u?.passwordHash))) throw new AccountError('bad_login')
  await sql`update app.users set password_hash = ${await hashPassword(next)} where id = ${userId}`
}
