import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { AuthForm } from '@/components/AuthForm'
import { resetAction } from '../actions'

export const metadata = { title: 'Reset password' }

export default async function Reset() {
  const { t } = await getT()
  return (
    <div className="ds-glass ds-glass-strong p-6 sm:p-8">
      <h1 className="ds-display mb-2 text-[32px]">{t('auth.resetTitle')}</h1>
      <p className="text-[14.5px] ds-muted">{t('auth.resetSub')}</p>
      <div className="mt-5"><AuthForm mode="reset" action={resetAction} /></div>
      <p className="mt-6 text-sm"><Link className="ds-link" href="/login">{t('auth.login')}</Link></p>
    </div>
  )
}
