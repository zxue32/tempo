import Link from 'next/link'
import { unsubscribe } from '@/lib/data/crm'
import { getT } from '@/lib/i18n/server'
import { PlatformMark } from '@/components/ui'

export const metadata = { title: 'Unsubscribe', robots: { index: false } }

/** The link at the bottom of every campaign email. One visit is enough; the token is never shown. */
export default async function UnsubscribePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  const ok = await unsubscribe(token)
  const { t } = await getT()
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-start justify-center gap-4 px-4">
      <PlatformMark size={28} />
      <h1 className="font-display text-[30px] font-extrabold tracking-tight">{ok ? t('cu.unsub.title') : '404'}</h1>
      <p className="text-muted">{ok ? t('cu.unsub.body') : t('cu.unsub.bad')}</p>
      <Link href="/" className="btn">{t('c.back')}</Link>
    </main>
  )
}
