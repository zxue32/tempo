import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { shopsForUser } from '@/lib/data/shops'
import { getT } from '@/lib/i18n/server'
import { PlatformMark, ShopStatusChip } from '@/components/ui'
import { LangToggle } from '@/components/i18n'

export const metadata = { title: 'Dashboard' }

export default async function DashboardHome() {
  const user = await requireUser('/dashboard')
  const shops = await shopsForUser(user.id)
  const { t } = await getT()
  if (!shops.length && !user.isAdmin) redirect('/onboarding')
  if (shops.length === 1 && !user.isAdmin) redirect(`/dashboard/${shops[0].id}${shops[0].role === 'staff' ? '/me' : ''}`)
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <PlatformMark />
        <div className="flex items-center gap-2">
          <LangToggle />
          <form action="/auth/signout" method="post"><button className="btn btn-sm btn-ghost">{t('c.signOut')}</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
        <h1 className="font-display mb-4 text-[28px] font-extrabold">{t('d.pickShop')}</h1>
        {user.isAdmin && <Link href="/admin" className="btn btn-dark mb-4">{t('d.admin')}</Link>}
        {!shops.length && <p className="text-muted">{t('d.noShops')}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {shops.map(s => (
            <li key={s.id}>
              <Link href={`/dashboard/${s.id}${s.role === 'staff' ? '/me' : ''}`} className="card flex items-center justify-between gap-3 p-4 text-ink no-underline hover:border-ink">
                <span className="min-w-0"><b className="block truncate">{s.name}</b><span className="text-[13px] text-muted">/{s.slug}</span></span>
                <ShopStatusChip status={s.status} t={t} />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/onboarding" className="btn mt-6">{t('d.newShop')}</Link>
      </main>
    </div>
  )
}
