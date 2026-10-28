import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { resetTokenAccount } from '@/lib/accounts'
import { AuthForm } from '@/components/AuthForm'
import { setNewPasswordAction } from '../../actions'

export const metadata = { title: 'Reset password', robots: { index: false } }

export default async function ResetWithToken(props: PageProps<'/reset/[token]'>) {
  const { token } = await props.params
  const { t } = await getT()
  const acct = await resetTokenAccount(token)
  return (
    <div className="ds-glass ds-glass-strong p-6 sm:p-8">
      <h1 className="ds-display mb-2 text-[32px]">{t('auth.resetTitle')}</h1>
      {acct ? (
        <>
          <p className="text-[14.5px] ds-muted">{acct.email}</p>
          <div className="mt-5"><AuthForm mode="password" action={setNewPasswordAction.bind(null, token)} /></div>
        </>
      ) : (
        <>
          <p className="ds-error mt-2">{t('auth.callbackError')}</p>
          <p className="mt-6 text-sm"><Link className="ds-link" href="/reset">{t('auth.sendReset')}</Link></p>
        </>
      )}
    </div>
  )
}
