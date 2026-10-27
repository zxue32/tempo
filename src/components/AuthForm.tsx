'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { useI18n } from './i18n'
import type { AuthState } from '@/app/(auth)/actions'

type Mode = 'login' | 'signup' | 'reset' | 'password' | 'change'

export function AuthForm({ mode, action, next, dev, defaultEmail, invite }: {
  mode: Mode
  action: (s: AuthState, f: FormData) => Promise<AuthState>
  next?: string
  dev?: boolean
  defaultEmail?: string
  invite?: string
}) {
  const { t } = useI18n()
  const [state, run, pending] = useActionState(action, null)
  const done = state?.info && (mode === 'signup' || mode === 'reset')
  const submit = { login: 'auth.login', signup: 'auth.signup', reset: 'auth.sendReset', password: 'auth.updatePassword', change: 'auth.updatePassword' } as const
  return (
    <form action={run} className="flex flex-col gap-4" noValidate>
      {dev && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{t('auth.devNote')}</p>}
      <input type="hidden" name="next" value={next || ''} />
      {mode !== 'password' && mode !== 'change' && (
        <div>
          <label className="lbl" htmlFor="email">{t('c.email')}</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="inp" defaultValue={state?.email ?? defaultEmail ?? ''} />
        </div>
      )}
      {mode === 'change' && (
        <div>
          <label className="lbl" htmlFor="current">{t('auth.currentPassword')}</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required className="inp" />
        </div>
      )}
      {(mode === 'login' || mode === 'signup' || mode === 'password' || mode === 'change') && !dev && (
        <div>
          <div className="flex items-baseline justify-between">
            <label className="lbl" htmlFor="password">{mode === 'password' || mode === 'change' ? t('auth.newPassword') : t('auth.password')}</label>
            {mode === 'login' && <Link href="/reset" className="text-[13px] font-semibold text-accent">{t('auth.forgot')}</Link>}
          </div>
          <input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} className="inp" />
          {mode !== 'login' && <p className="hint">{t('auth.passwordHint')}</p>}
        </div>
      )}
      {mode === 'signup' && (
        <div>
          <label className="lbl" htmlFor="invite">{t('auth.invite')} <span className="font-normal">({t('c.optional')})</span></label>
          <input id="invite" name="invite" className="inp uppercase" defaultValue={invite || ''} autoComplete="off" />
          <p className="hint">{t('auth.inviteHint')}</p>
        </div>
      )}
      {mode === 'signup' && !dev && (
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer">{t('auth.adminSummary')}</summary>
          <div className="mt-2">
            <label className="lbl" htmlFor="setupCode">{t('auth.setupCode')}</label>
            <input id="setupCode" name="setupCode" className="inp" autoComplete="off" />
            <p className="hint">{t('auth.setupCodeHint')}</p>
          </div>
        </details>
      )}
      {state?.error && <p className="err" role="alert">{t(state.error)}</p>}
      {state?.info && <p className="rounded-lg bg-ok-soft px-3 py-2 text-[14px] text-ok" role="status">{t(state.info, state.infoArg ?? '')}</p>}
      {!done && (
        <button className="btn btn-primary btn-block !min-h-[46px]" disabled={pending}>{pending ? '…' : t(submit[mode])}</button>
      )}
    </form>
  )
}
