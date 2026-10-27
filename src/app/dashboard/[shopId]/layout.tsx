import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireShop } from '@/lib/auth'
import { getShop, shopsForUser } from '@/lib/data/shops'
import { getT } from '@/lib/i18n/server'
import { PlatformMark, ShopStatusChip } from '@/components/ui'
import { LangToggle } from '@/components/i18n'
import { DashNav } from './DashNav'
import { SubmitButton } from './SubmitButton'

export default async function ShopLayout(props: LayoutProps<'/dashboard/[shopId]'>) {
  const { shopId } = await props.params
  const { user, member } = await requireShop(shopId, 'staff')
  const shop = await getShop(shopId)
  if (!shop) notFound()
  const { t } = await getT()
  const others = (await shopsForUser(user.id)).filter(s => s.id !== shop.id)
  const isStaff = member.role === 'staff'
  const banner = !isStaff && shop.status !== 'live'
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[240px] lg:flex-none lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:gap-4 lg:py-5">
          <Link href="/dashboard" className="text-ink no-underline"><PlatformMark size={24} /></Link>
          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <LangToggle />
          </div>
          <div className="hidden rounded-xl border border-line bg-bg p-3 lg:block">
            <b className="block truncate text-[14px]">{shop.name}</b>
            <div className="mt-1 flex items-center gap-2"><ShopStatusChip status={shop.status} t={t} /></div>
            {others.length > 0 && (
              <details className="mt-2 text-[13px]">
                <summary className="cursor-pointer text-muted">{t('d.switchShop')}</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {others.map(o => <li key={o.id}><Link className="text-accent" href={`/dashboard/${o.id}`}>{o.name}</Link></li>)}
                </ul>
              </details>
            )}
          </div>
        </div>
        <DashNav shopId={shop.id} role={member.role} slug={shop.slug} />
        <div className="hidden flex-col gap-2 border-t border-line p-4 lg:mt-auto lg:flex">
          <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm">{t('d.viewStore')} ↗</a>
          {user.isAdmin && <Link href="/admin" className="btn btn-sm btn-ghost">{t('d.admin')}</Link>}
          <div className="flex items-center justify-between">
            <LangToggle />
            <form action="/auth/signout" method="post"><button className="btn btn-sm btn-ghost">{t('c.signOut')}</button></form>
          </div>
          <span className="truncate text-[12px] text-muted">{user.email}</span>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {banner && (
          <div className={`border-b px-4 py-3 text-[14px] sm:px-6 ${shop.status === 'changes' || shop.status === 'rejected' || shop.status === 'suspended' ? 'border-warn/30 bg-warn-soft text-warn' : 'border-accent/20 bg-accent-soft text-accent-deep'}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-0 flex-1">
                {t(`d.banner.${shop.status}` as 'd.banner.draft')} {shop.reviewNote && ['changes', 'rejected', 'suspended'].includes(shop.status) && <b className="whitespace-pre-wrap">{shop.reviewNote}</b>}
              </span>
              {shop.status === 'draft' && <Link href={`/dashboard/${shop.id}/setup`} className="btn btn-sm btn-primary">{t('d.setup')}</Link>}
              {(shop.status === 'changes' || shop.status === 'rejected') && <SubmitButton shopId={shop.id} label={t('d.resubmit')} />}
            </div>
          </div>
        )}
        <main className="px-4 pb-16 pt-5 sm:px-6">{props.children}</main>
      </div>
    </div>
  )
}
