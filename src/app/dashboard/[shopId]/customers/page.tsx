import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listCustomers } from '@/lib/data/insights'
import { getT } from '@/lib/i18n/server'
import { fmtDate, nowInZone } from '@/lib/tz'
import { money } from '@/components/ui'

export default async function CustomersPage(props: PageProps<'/dashboard/[shopId]/customers'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : ''
  const sort = sp.sort === 'visits' || sp.sort === 'name' ? sp.sort : 'recent'
  const rows = await listCustomers(shopId, today, q, sort)
  const base = `/dashboard/${shopId}/customers`
  const href = (o: { sort?: string }) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), sort: o.sort ?? sort }).toString()}`

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('cu.title')}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex min-w-0 flex-1 gap-2" role="search">
          <input type="hidden" name="sort" value={sort} />
          <input name="q" type="search" aria-label={t('c.search')} className="inp min-w-0 flex-1 sm:max-w-sm" defaultValue={q} placeholder={t('cu.searchPh')} />
          <button className="btn btn-dark">{t('c.search')}</button>
        </form>
        <nav className="seg" aria-label="Sort">
          {(['recent', 'visits', 'name'] as const).map(s => (
            <Link key={s} href={href({ sort: s })} aria-current={sort === s ? 'page' : undefined} className="no-underline">
              {t(s === 'recent' ? 'cu.sortRecent' : s === 'visits' ? 'cu.sortVisits' : 'cu.sortName')}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-[14px] text-muted">{t('cu.count', rows.length)}</p>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">{q ? t('bl.empty') : t('cu.empty')}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{t('c.name')}</th><th className="hidden sm:table-cell">{t('c.phone')}</th><th className="r">{t('cu.visits')}</th>
              <th className="r hidden md:table-cell">{t('cu.noShows')}</th><th className="hidden md:table-cell">{t('cu.last')}</th><th className="hidden lg:table-cell">{t('cu.next')}</th>
              {shop.showPrices && <th className="r hidden lg:table-cell">{t('cu.spent')}</th>}
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td>
                    <Link href={`${base}/${c.id}`} className="font-semibold">{c.name}</Link>
                    {c.blocked && <span className="chip chip-bad ml-2">{t('cu.blockedChip')}</span>}
                    <span className="tnum block text-[12.5px] text-muted sm:hidden">{c.phone}</span>
                  </td>
                  <td className="tnum hidden sm:table-cell">{c.phone ?? <span className="text-muted">{c.email}</span>}</td>
                  <td className="r tnum">{c.visits}</td>
                  <td className={`r tnum hidden md:table-cell ${c.noShows ? 'font-bold text-warn' : 'text-muted'}`}>{c.noShows}</td>
                  <td className="tnum hidden md:table-cell">{c.lastVisit ? fmtDate(c.lastVisit, lang) : '—'}</td>
                  <td className="tnum hidden lg:table-cell">{c.nextVisit ? fmtDate(c.nextVisit, lang) : '—'}</td>
                  {shop.showPrices && <td className="r tnum hidden lg:table-cell">{c.spentCents ? money(c.spentCents) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
