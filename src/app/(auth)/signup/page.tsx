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
    <div className="card p-6 sm:p-8">
      <h1 className="font-display mb-1 text-[28px] font-extrabold">{t('auth.signupTitle')}</h1>
      <p className="text-[14px] text-muted">{t('auth.signupSub')}</p>
      <div className="mt-5"><AuthForm mode="signup" action={signupAction} next={next} dev={devAuthEnabled()} invite={invite} defaultEmail={email} /></div>
      <p className="mt-6 text-sm text-muted">{t('auth.haveAccount')} <Link className="font-semibold text-accent" href={`/login?next=${encodeURIComponent(next)}`}>{t('auth.login')}</Link></p>
    </div>
  )
}
