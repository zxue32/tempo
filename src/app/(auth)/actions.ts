'use server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { devAuthEnabled, env } from '@/lib/env'
import { emailRe } from '@/lib/validate'
import { allow, clientKey } from '@/lib/ratelimit'
import type { DictKey } from '@/lib/i18n'
import { safeNext } from '@/lib/url'
import { AccountError, createAccount, checkLogin, startSession, endSession, createResetToken, useResetToken, changePassword, normEmail, SESSION_DAYS } from '@/lib/accounts'
import { getUser, SESSION_COOKIE } from '@/lib/auth'
import { sql } from '@/lib/db'
import { emailConfigured, mailPasswordReset } from '@/lib/email'
import { getLang } from '@/lib/i18n/server'

export type AuthState = { error?: DictKey; info?: DictKey; infoArg?: string; email?: string } | null

const ERR: Record<AccountError['code'], DictKey> = {
  bad_email: 'auth.badEmail', weak_password: 'auth.weakPassword', exists: 'auth.exists', bad_login: 'auth.badLogin',
  disabled: 'auth.disabled', needs_setup_code: 'auth.needsSetupCode', bad_token: 'auth.callbackError',
}

async function rememberInvite(code: unknown) {
  const c = typeof code === 'string' ? code.trim().toUpperCase() : ''
  if (/^[A-Z0-9-]{4,32}$/.test(c)) (await cookies()).set('tempo_invite', c, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', httpOnly: true })
}

async function setSession(userId: string) {
  const token = await startSession(userId, (await headers()).get('user-agent'))
  ;(await cookies()).set(SESSION_COOKIE, token, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * SESSION_DAYS,
  })
}

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = normEmail(String(form.get('email') || ''))
  const next = safeNext(form.get('next'))
  if (!emailRe.test(email)) return { error: 'auth.badEmail', email }
  if (!(await allow('login:' + (await clientKey()), 20, 600)) || !(await allow('login-email:' + email, 10, 600))) return { error: 'auth.rate', email }
  if (devAuthEnabled()) {
    (await cookies()).set('dev_user', email, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
    redirect(next)
  }
  try {
    const acct = await checkLogin(email, String(form.get('password') || ''))
    await setSession(acct.id)
  } catch (e) {
    if (e instanceof AccountError) return { error: ERR[e.code], email }
    throw e
  }
  redirect(next)
}

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = normEmail(String(form.get('email') || ''))
  const next = safeNext(form.get('next'), '/onboarding')
  await rememberInvite(form.get('invite'))
  if (!emailRe.test(email)) return { error: 'auth.badEmail', email }
  if (!(await allow('signup:' + (await clientKey()), 10, 3600))) return { error: 'auth.rate', email }
  if (devAuthEnabled()) {
    (await cookies()).set('dev_user', email, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
    redirect(next)
  }
  try {
    const acct = await createAccount({ email, password: String(form.get('password') || ''), setupCode: String(form.get('setupCode') || '') || null, lang: await getLang() })
    await setSession(acct.id)
  } catch (e) {
    if (e instanceof AccountError) return { error: ERR[e.code], email }
    throw e
  }
  redirect(next)
}

/** Email a reset link when email is set up; otherwise tell people to ask the platform admin. Never reveals whether an account exists. */
export async function resetAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = normEmail(String(form.get('email') || ''))
  if (!emailRe.test(email)) return { error: 'auth.badEmail', email }
  if (!(await allow('reset:' + (await clientKey()), 5, 3600))) return { error: 'auth.rate', email }
  if (!emailConfigured()) return { info: 'auth.resetNoEmail', email }
  const [u] = await sql<{ id: string; lang: 'zh' | 'en' }[]>`select id, lang from app.users where lower(email) = ${email} and not disabled`
  if (u) {
    const token = await createResetToken(u.id, null)
    await mailPasswordReset(email, u.lang, `${env.siteUrl}/reset/${token}`)
  }
  return { info: 'auth.resetSent', email }
}

export async function setNewPasswordAction(token: string, _: AuthState, form: FormData): Promise<AuthState> {
  if (!(await allow('reset-use:' + (await clientKey()), 10, 3600))) return { error: 'auth.rate' }
  try {
    const userId = await useResetToken(token, String(form.get('password') || ''))
    await setSession(userId)
  } catch (e) {
    if (e instanceof AccountError) return { error: ERR[e.code] }
    throw e
  }
  redirect('/dashboard')
}

export async function updatePasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const user = await getUser()
  if (!user) redirect('/login?next=/account/password')
  try {
    await changePassword(user.id, String(form.get('current') || ''), String(form.get('password') || ''))
  } catch (e) {
    if (e instanceof AccountError) return { error: e.code === 'bad_login' ? 'auth.wrongCurrent' : ERR[e.code] }
    throw e
  }
  return { info: 'auth.passwordUpdated' }
}

export async function signOutAction() {
  const store = await cookies()
  await endSession(store.get(SESSION_COOKIE)?.value)
  store.delete(SESSION_COOKIE)
  store.delete('dev_user')
  redirect('/')
}
