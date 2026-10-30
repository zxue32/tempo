import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listCustomers, customerTags, openFollowUps, segmentOf, isSegment, SEGMENTS, type Segment } from '@/lib/data/crm'
import { getT } from '@/lib/i18n/server'
import type { DictKey } from '@/lib/i18n'
import { fmtDate, nowInZone } from '@/lib/tz'
import { money } from '@/components/ui'
import { CustomersNav } from './CustomersNav'
import { SEG_CHIP } from './segments'

export default async function CustomersPage(props: PageProps<'/dashboard/[shopId]/customers'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : ''
  const sort = sp.sort === 'visits' || sp.sort === 'name' ? sp.sort : 'recent'
  const segment: Segment = isSegment(sp.seg) ? sp.seg : 'all'
  const tag = typeof sp.tag === 'string' ? sp.tag.slice(0, 40) : ''
  const [rows, tags, due] = await Promise.all([
    listCustomers(shopId, today, q, sort, 300, { segment, tag: tag || undefined }),
    customerTags(shopId),
    openFollowUps(shopId, today),
  ])
  const base = `/dashboard/${shopId}/customers`
  const href = (o: { sort?: string; seg?: string; tag?: string }) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    p.set('sort', o.sort ?? sort)
    const s = o.seg ?? segment; if (s !== 'all') p.set('seg', s)
    const tg = o.tag ?? tag; if (tg) p.set('tag', tg)
    return `${base}?${p.toString()}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('cu.title')}</h1>
        <CustomersNav shopId={shopId} badge={due.length} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex min-w-0 flex-1 gap-2" role="search">
          <input type="hidden" name="sort" value={sort} />
          {segment !== 'all' && <input type="hidden" name="seg" value={segment} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
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
      <div className="flex flex-wrap items-center gap-2">
        {SEGMENTS.map(s => (
          <Link key={s} href={href({ seg: s })} title={s === 'all' ? undefined : t(`cu.segHint.${s}` as DictKey)} aria-current={segment === s ? 'page' : undefined}
            className={`chip h-8 px-3 text-[13px] no-underline ${segment === s ? 'bg-ink text-white' : ''}`}>
            {t(`cu.seg.${s}` as DictKey)}
          </Link>
        ))}
        {tags.length > 0 && (
          <form method="get" className="ml-auto">
            <input type="hidden" name="sort" value={sort} />
            {segment !== 'all' && <input type="hidden" name="seg" value={segment} />}
            {q && <input type="hidden" name="q" value={q} />}
            <label className="sr-only" htmlFor="cu-tag">{t('cu.tagFilter')}</label>
            <select id="cu-tag" name="tag" className="inp inp-sm !w-auto" defaultValue={tag}>
              <option value="">{t('cu.tagAll')}</option>
              {tags.map(x => <option key={x.tag} value={x.tag}>{x.tag} · {x.n}</option>)}
            </select>
            <button className="btn btn-sm ml-1">{t('cu.tagFilter')}</button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-muted">{t('cu.count', rows.length)}</p>
        <div className="flex gap-2">
          <a className="btn btn-sm" href={`${base}/export${segment !== 'all' || tag ? `?${new URLSearchParams({ ...(segment !== 'all' ? { seg: segment } : {}), ...(tag ? { tag } : {}) })}` : ''}`}>{t('cu.export')}</a>
          <Link className="btn btn-sm btn-primary no-underline" href={`${base}/new`}>{t('cu.newClient')}</Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">{q || segment !== 'all' || tag ? t('bl.empty') : t('cu.empty')}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{t('c.name')}</th><th className="hidden sm:table-cell">{t('c.phone')}</th><th className="r">{t('cu.visits')}</th>
              <th className="r hidden md:table-cell">{t('cu.noShows')}</th><th className="hidden md:table-cell">{t('cu.last')}</th><th className="hidden lg:table-cell">{t('cu.next')}</th>
              {shop.showPrices && <th className="r hidden lg:table-cell">{t('cu.spent')}</th>}
            </tr></thead>
            <tbody>
              {rows.map(c => {
                const seg = segmentOf(c, today, shop.rebookDays)
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`${base}/${c.id}`} className="font-semibold">{c.name}</Link>
                      {seg !== 'new' && <span className={`chip ml-2 ${SEG_CHIP[seg] ?? ''}`}>{t(`cu.seg.${seg}` as DictKey)}</span>}
                      {c.blocked && <span className="chip chip-bad ml-2">{t('cu.blockedChip')}</span>}
                      {c.tags.length > 0 && <span className="ml-2 hidden text-[12px] text-muted md:inline">{c.tags.slice(0, 3).join(' · ')}{c.tags.length > 3 ? ' …' : ''}</span>}
                      <span className="tnum block text-[12.5px] text-muted sm:hidden">{c.phone}</span>
                    </td>
                    <td className="tnum hidden sm:table-cell">{c.phone ?? <span className="text-muted">{c.email}</span>}</td>
                    <td className="r tnum">{c.visits}</td>
                    <td className={`r tnum hidden md:table-cell ${c.noShows ? 'font-bold text-warn' : 'text-muted'}`}>{c.noShows}</td>
                    <td className="tnum hidden md:table-cell">{c.lastVisit ? fmtDate(c.lastVisit, lang) : '—'}</td>
                    <td className="tnum hidden lg:table-cell">{c.nextVisit ? fmtDate(c.nextVisit, lang) : '—'}</td>
                    {shop.showPrices && <td className="r tnum hidden lg:table-cell">{c.spentCents ? money(c.spentCents, shop.currency) : '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
