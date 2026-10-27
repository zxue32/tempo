import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { PlatformMark } from '@/components/ui'

export default async function NotFound() {
  const { t } = await getT()
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-start justify-center gap-4 px-4">
      <PlatformMark size={28} />
      <h1 className="font-display text-[36px] font-extrabold tracking-tight">404</h1>
      <p className="text-muted">{t('c.notFound')}</p>
      <Link href="/" className="btn">{t('c.back')}</Link>
    </main>
  )
}
