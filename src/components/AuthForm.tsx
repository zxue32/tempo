'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { useI18n } from './i18n'
import type { AuthState } from '@/app/(auth)/actions'
import { Button, Notice, PasswordField, TextField } from './ds'

type Mode = 'login' | 'signup' | 'reset' | 'password' | 'change'

/** Sign-in, sign-up and password forms. `look="ds"` (default) is the deep-space look of the sign-in pages;
    `look="plain"` keeps the dashboard look for the account page. */
export function AuthForm({ mode, action, next, dev, defaultEmail, invite, look = 'ds' }: {
  mode: Mode
  action: (s: AuthState, f: FormData) => Promise<AuthState>
  next?: string
  dev?: boolean
  defaultEmail?: string
  invite?: string
  look?: 'ds' | 'plain'
}) {
  const { t } = useI18n()
  const [state, run, pending] = useActionState(action, null)
  const done = state?.info && (mode === 'signup' || mode === 'reset')
  const submit = { login: 'auth.login', signup: 'auth.signup', reset: 'auth.sendReset', password: 'auth.updatePassword', change: 'auth.updatePassword' } as const
  const needsEmail = mode !== 'password' && mode !== 'change'
  const needsPassword = (mode === 'login' || mode === 'signup' || mode === 'password' || mode === 'change') && !dev
  const err = state?.error ? t(state.error) : null

  if (look === 'plain') {
    return (
      <form action={run} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next || ''} />
        {mode === 'change' && (
          <div><label className="lbl" htmlFor="current">{t('auth.currentPassword')}</label>
            <input id="current" name="current" type="password" autoComplete="current-password" required className="inp" /></div>
        )}
        {needsPassword && (
          <div><label className="lbl" htmlFor="password">{t('auth.newPassword')}</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="inp" />
            <p className="hint">{t('auth.passwordHint')}</p></div>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        {state?.info && <p className="rounded-lg bg-ok-soft px-3 py-2 text-[14px] text-ok" role="status">{t(state.info, state.infoArg ?? '')}</p>}
        <button className="btn btn-primary btn-block !min-h-[46px]" disabled={pending}>{pending ? '…' : t(submit[mode])}</button>
      </form>
    )
  }

  // which field the server's error is about, so the message sits under it
  const aboutEmail = !!err && /email|邮箱/i.test(err), aboutPw = !!err && /password|密码/i.test(err)
  const emailErr = aboutEmail && !aboutPw ? err : null   // "wrong email or password" is about the pair, so it goes under the form
  const pwErr = aboutPw && !aboutEmail ? err : null
  const formErr = err && !emailErr && !pwErr ? err : null
  return (
    <form action={run} className="flex flex-col gap-5" noValidate>
      {dev && <Notice tone="warn">{t('auth.devNote')}</Notice>}
      <input type="hidden" name="next" value={next || ''} />
      {needsEmail && (
        <TextField label={t('c.email')} id="email" name="email" type="email" autoComplete="email" inputMode="email" required
          defaultValue={state?.email ?? defaultEmail ?? ''} error={emailErr} />
      )}
      {mode === 'change' && (
        <PasswordField label={t('auth.currentPassword')} id="current" name="current" autoComplete="current-password" required showLabel={t('auth.showPw')} hideLabel={t('auth.hidePw')} />
      )}
      {needsPassword && (
        <PasswordField
          label={mode === 'password' || mode === 'change' ? t('auth.newPassword') : t('auth.password')}
          aside={mode === 'login' ? <Link href="/reset" className="ds-link text-[13px]">{t('auth.forgot')}</Link> : undefined}
          id="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8}
          hint={mode !== 'login' ? t('auth.passwordHint') : undefined} error={pwErr} showLabel={t('auth.showPw')} hideLabel={t('auth.hidePw')} />
      )}
      {mode === 'signup' && (
        <TextField label={<>{t('auth.invite')} <span className="font-normal ds-muted">({t('c.optional')})</span></>} id="invite" name="invite"
          className="uppercase" defaultValue={invite || ''} autoComplete="off" hint={t('auth.inviteHint')} />
      )}
      {mode === 'signup' && !dev && (
        <details className="text-[13px] ds-muted">
          <summary className="cursor-pointer">{t('auth.adminSummary')}</summary>
          <div className="mt-3"><TextField label={t('auth.setupCode')} id="setupCode" name="setupCode" autoComplete="off" hint={t('auth.setupCodeHint')} /></div>
        </details>
      )}
      {formErr && <Notice tone="bad">{formErr}</Notice>}
      {state?.info && <Notice tone="ok">{t(state.info, state.infoArg ?? '')}</Notice>}
      {!done && <Button type="submit" variant="primary" size="lg" block loading={pending}>{t(submit[mode])}</Button>}
    </form>
  )
}
