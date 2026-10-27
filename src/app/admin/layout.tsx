import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { PlatformMark } from '@/components/ui'
import { LangToggle } from '@/components/i18n'

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const user = await requireAdmin()
  const { t } = await getT()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 text-ink no-underline"><PlatformMark size={24} /><span className="chip chip-accent">{t('ad.title')}</span></Link>
          <nav className="flex gap-1 text-[14px] font-semibold">
            <Link href="/admin" className="rounded-lg px-3 py-1.5 text-ink-2 no-underline hover:bg-bg">{t('ad.shops')}</Link>
            <Link href="/admin/invites" className="rounded-lg px-3 py-1.5 text-ink-2 no-underline hover:bg-bg">{t('ad.invites')}</Link>
            <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-ink-2 no-underline hover:bg-bg">{t('ad.myShops')}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12.5px] text-muted sm:inline">{user.email}</span>
            <LangToggle />
            <form action="/auth/signout" method="post"><button className="btn btn-sm btn-ghost">{t('c.signOut')}</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
    </div>
  )
}
