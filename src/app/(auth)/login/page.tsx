import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { AuthForm } from '@/components/AuthForm'
import { loginAction } from '../actions'
import { safeNext } from '@/lib/url'
import { devAuthEnabled } from '@/lib/env'

export const metadata = { title: 'Login' }

export default async function Login(props: PageProps<'/login'>) {
  const sp = await props.searchParams
  const { t } = await getT()
  const next = safeNext(sp.next)
  return (
    <div className="ds-glass ds-glass-strong p-6 sm:p-8">
      <h1 className="ds-display mb-2 text-[32px]">{devAuthEnabled() ? t('auth.devTitle') : t('auth.loginTitle')}</h1>
      {sp.error === 'callback' && <p className="ds-error mb-3">{t('auth.callbackError')}</p>}
      <div className="mt-4"><AuthForm mode="login" action={loginAction} next={next} dev={devAuthEnabled()} /></div>
      <p className="mt-6 text-[14px] ds-muted">{t('auth.noAccount')} <Link className="ds-link" href={`/signup?next=${encodeURIComponent(next === '/dashboard' ? '/onboarding' : next)}`}>{t('auth.signup')}</Link></p>
    </div>
  )
}
