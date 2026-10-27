import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { PlatformMark } from '@/components/ui'
import { LangToggle } from '@/components/i18n'
import { OnboardingForm } from './OnboardingForm'
import { env } from '@/lib/env'

export const metadata = { title: 'Open a shop' }

export default async function Onboarding() {
  await requireUser('/onboarding')
  const { t, lang } = await getT()
  const invite = (await cookies()).get('tempo_invite')?.value || ''
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-ink no-underline"><PlatformMark /></Link>
        <LangToggle />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        <h1 className="font-display text-[32px] font-extrabold tracking-tight">{t('ob.title')}</h1>
        <p className="mb-6 text-muted">{t('ob.sub')}</p>
        <OnboardingForm lang={lang} siteUrl={env.siteUrl} invite={invite} />
      </main>
    </div>
  )
}
