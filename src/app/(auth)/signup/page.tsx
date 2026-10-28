import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { AuthForm } from '@/components/AuthForm'
import { signupAction } from '../actions'
import { safeNext } from '@/lib/url'
import { devAuthEnabled } from '@/lib/env'

export const metadata = { title: 'Sign up' }

export default async function Signup(props: PageProps<'/signup'>) {
  const sp = await props.searchParams
  const { t } = await getT()
  const next = safeNext(sp.next, '/onboarding')
  const invite = typeof sp.invite === 'string' ? sp.invite : ''
  const email = typeof sp.email === 'string' ? sp.email : ''
  return (
    <div className="ds-glass ds-glass-strong p-6 sm:p-8">
      <h1 className="ds-display mb-2 text-[32px]">{t('auth.signupTitle')}</h1>
      <p className="text-[14.5px] ds-muted">{t('auth.signupSub')}</p>
      <div className="mt-5"><AuthForm mode="signup" action={signupAction} next={next} dev={devAuthEnabled()} invite={invite} defaultEmail={email} /></div>
      <p className="mt-6 text-[14px] ds-muted">{t('auth.haveAccount')} <Link className="ds-link" href={`/login?next=${encodeURIComponent(next)}`}>{t('auth.login')}</Link></p>
    </div>
  )
}
