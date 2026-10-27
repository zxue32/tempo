import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { AuthForm } from '@/components/AuthForm'
import { resetAction } from '../actions'

export const metadata = { title: 'Reset password' }

export default async function Reset() {
  const { t } = await getT()
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="font-display mb-1 text-[28px] font-extrabold">{t('auth.resetTitle')}</h1>
      <p className="text-[14px] text-muted">{t('auth.resetSub')}</p>
      <div className="mt-5"><AuthForm mode="reset" action={resetAction} /></div>
      <p className="mt-6 text-sm"><Link className="font-semibold text-accent" href="/login">{t('auth.login')}</Link></p>
    </div>
  )
}
