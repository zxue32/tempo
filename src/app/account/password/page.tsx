import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { requireUser } from '@/lib/auth'
import { AuthForm } from '@/components/AuthForm'
import { updatePasswordAction } from '@/app/(auth)/actions'
import { PlatformMark } from '@/components/ui'

export default async function PasswordPage() {
  await requireUser('/account/password')
  const { t } = await getT()
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-5xl px-4 py-3"><Link href="/dashboard" className="text-ink no-underline"><PlatformMark /></Link></header>
      <main className="mx-auto max-w-md px-4 pt-10">
        <div className="card p-6 sm:p-8">
          <h1 className="font-display mb-4 text-[28px] font-extrabold">{t('auth.resetTitle')}</h1>
          <AuthForm mode="password" action={updatePasswordAction} />
          <p className="mt-6 text-sm"><Link className="font-semibold text-accent" href="/dashboard">{t('home.dashboard')}</Link></p>
        </div>
      </main>
    </div>
  )
}
