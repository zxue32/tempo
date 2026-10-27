import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { adminCounts, adminListShops } from '@/lib/data/shops'
import { getT } from '@/lib/i18n/server'
import { ShopStatusChip } from '@/components/ui'
import type { ShopStatus } from '@/lib/types'

const TABS: Array<ShopStatus | 'all'> = ['pending', 'live', 'changes', 'draft', 'rejected', 'suspended', 'all']

export default async function AdminHome(props: PageProps<'/admin'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const { t, lang } = await getT()
  const counts = await adminCounts()
  const tab = TABS.includes(sp.status as ShopStatus) ? (sp.status as ShopStatus | 'all') : counts.pending ? 'pending' : 'all'
  const shops = await adminListShops(tab)
  const dt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('ad.shops')}</h1>
        {counts.pending ? <span className="chip chip-accent">{t('ad.queue', counts.pending)}</span> : null}
      </div>
      <nav className="seg self-start" aria-label={t('c.status')}>
        {TABS.map(s => (
          <Link key={s} href={`/admin?status=${s}`} aria-current={tab === s ? 'page' : undefined} className="gap-1.5 no-underline">
            {s === 'all' ? t('ad.allShops') : t(`st.${s}`)} <span className="tnum opacity-70">{counts[s] ?? 0}</span>
          </Link>
        ))}
      </nav>
      {shops.length === 0 ? <div className="card p-8 text-center text-muted">{t('ad.empty')}</div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t('ad.colShop')}</th><th>{t('ad.colOwner')}</th><th>{t('c.status')}</th><th>{t('ad.colSubmitted')}</th><th className="r">{t('ad.colCounts')}</th><th /></tr></thead>
            <tbody>
              {shops.map(s => (
                <tr key={s.id}>
                  <td><Link href={`/admin/shops/${s.id}`} className="font-semibold">{s.name}</Link><span className="block text-[12.5px] text-muted">/{s.slug} · {s.city || '—'}</span></td>
                  <td className="text-[13.5px]">{s.ownerEmail}</td>
                  <td><ShopStatusChip status={s.status} t={t} /></td>
                  <td className="tnum whitespace-nowrap text-[13px]">{s.submittedAt ? dt.format(s.submittedAt) : '—'}</td>
                  <td className="r tnum">{s.staffCount} / {s.serviceCount} / {s.upcoming}</td>
                  <td className="r"><Link href={`/admin/shops/${s.id}`} className="btn btn-sm">{s.status === 'pending' ? t('ad.review') : t('c.edit')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
