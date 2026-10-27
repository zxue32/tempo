'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase'
import { devAuthEnabled, env } from '@/lib/env'
import { emailRe } from '@/lib/validate'
import { allow, clientKey } from '@/lib/ratelimit'
import type { DictKey } from '@/lib/i18n'
import { safeNext } from '@/lib/url'

export type AuthState = { error?: DictKey; info?: DictKey; infoArg?: string; email?: string } | null

async function rememberInvite(code: unknown) {
  const c = typeof code === 'string' ? code.trim().toUpperCase() : ''
  if (/^[A-Z0-9-]{4,32}$/.test(c)) (await cookies()).set('tempo_invite', c, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', httpOnly: true })
}

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') || '').trim().toLowerCase()
  const next = safeNext(form.get('next'))
  if (!emailRe.test(email)) return { error: 'auth.badEmail', email }
  if (!(await allow('login:' + (await clientKey()), 20, 600))) return { error: 'auth.rate', email }
  if (devAuthEnabled()) {
    (await cookies()).set('dev_user', email, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
    redirect(next)
  }
  const password = String(form.get('password') || '')
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (/confirm/i.test(error.message)) return { error: 'auth.notConfirmed', email }
    if (error.status === 429) return { error: 'auth.rate', email }
    return { error: 'auth.badLogin', email }
  }
  redirect(next)
}

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') || '').trim().toLowerCase()
  const password = String(form.get('password') || '')
  const next = safeNext(form.get('next'), '/onboarding')
  await rememberInvite(form.get('invite'))
  if (!emailRe.test(email)) return { error: 'auth.badEmail', email }
  if (!(await allow('signup:' + (await clientKey()), 10, 3600))) return { error: 'auth.rate', email }
  if (devAuthEnabled()) {
    (await cookies()).set('dev_user', email, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
    redirect(next)
  }
  if (password.length < 8) return { error: 'auth.weakPassword', email }
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error) {
    if (/registered|exists/i.test(error.message)) return { error: 'auth.exists', email }
    if (error.status === 429) return { error: 'auth.rate', email }
    if (/password/i.test(error.message)) return { error: 'auth.weakPassword', email }
    return { error: 'auth.badEmail', email }
  }
  if (data.session) redirect(next)
  // Supabase returns a user with no identities when the email is already registered
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { error: 'auth.exists', email }
  return { info: 'auth.checkEmail', infoArg: email, email }
}

export async function resetAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') || '').trim().toLowerCase()
  if (!emailRe.test(email)) return { error: 'auth.badEmail', email }
  if (!(await allow('reset:' + (await clientKey()), 5, 3600))) return { error: 'auth.rate', email }
  if (!devAuthEnabled()) {
    const supabase = await supabaseServer()
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/callback?next=/account/password` })
  }
  return { info: 'auth.resetSent', email }
}

export async function updatePasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get('password') || '')
  if (password.length < 8) return { error: 'auth.weakPassword' }
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: 'auth.callbackError' }
  return { info: 'auth.passwordUpdated' }
}
