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
    <div className="card p-6 sm:p-8">
      <h1 className="font-display mb-1 text-[28px] font-extrabold">{t('auth.resetTitle')}</h1>
      {acct ? (
        <>
          <p className="text-[14px] text-muted">{acct.email}</p>
          <div className="mt-5"><AuthForm mode="password" action={setNewPasswordAction.bind(null, token)} /></div>
        </>
      ) : (
        <>
          <p className="err mt-2">{t('auth.callbackError')}</p>
          <p className="mt-6 text-sm"><Link className="font-semibold text-accent" href="/reset">{t('auth.sendReset')}</Link></p>
        </>
      )}
    </div>
  )
}
