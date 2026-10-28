import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff } from '@/lib/data/catalog'
import { searchBookings } from '@/lib/data/insights'
import { bookingFilters, monthRange } from '@/lib/filters'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { addDays, fmtDate, fmtTime, nowInZone } from '@/lib/tz'
import { BookingStatusChip, money } from '@/components/ui'

const LIMIT = 500

export default async function BookingsPage(props: PageProps<'/dashboard/[shopId]/bookings'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const f = bookingFilters(sp, today)
  const [staff, rows] = await Promise.all([listStaff(shopId), searchBookings(shopId, f, LIMIT)])
  const staffById = new Map(staff.map(s => [s.id, s]))
  const base = `/dashboard/${shopId}/bookings`
  const qs = (o: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ from: f.from, to: f.to, staff: f.staffId, status: f.status, kind: f.kind, q: f.q || null, ...o })) if (v) p.set(k, v)
    return p.toString()
  }
  const month = monthRange(today)
  const presets: Array<[string, string, string]> = [
    [t('c.today'), today, today],
    [t('bl.next7'), today, addDays(today, 6)],
    [t('bl.past7'), addDays(today, -7), addDays(today, -1)],
    [t('bl.thisMonth'), month.from, month.to],
  ]
  const active = rows.filter(r => r.status === 'confirmed' || r.status === 'completed')
  const total = active.reduce((a, r) => a + (r.estPriceCents ?? 0), 0)
  const filtered = !!(f.staffId || f.status || f.kind || f.q)
  const sameYear = f.from.slice(0, 4) === today.slice(0, 4) && f.to.slice(0, 4) === today.slice(0, 4)
  const rangeFmt: Intl.DateTimeFormatOptions = sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }
  let lastDate = ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('bl.title')}</h1>
        <a className="btn btn-sm" href={`${base}/export?${qs({})}`} download>{t('bl.export')}</a>
      </div>

      <nav className="seg self-start" aria-label={t('bl.range')}>
        {presets.map(([label, from, to]) => (
          <Link key={label} href={`${base}?${qs({ from, to })}`} aria-current={f.from === from && f.to === to ? 'page' : undefined} className="no-underline">{label}</Link>
        ))}
      </nav>

      <form method="get" className="card grid gap-3 p-4 sm:grid-cols-3 xl:grid-cols-[150px_150px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <div><label className="lbl" htmlFor="f-from">{t('c.from')}</label><input id="f-from" name="from" type="date" className="inp tnum" defaultValue={f.from} /></div>
        <div><label className="lbl" htmlFor="f-to">{t('c.to')}</label><input id="f-to" name="to" type="date" className="inp tnum" defaultValue={f.to} /></div>
        <div><label className="lbl" htmlFor="f-staff">{t('rp.colStaff')}</label>
          <select id="f-staff" name="staff" className="inp" defaultValue={f.staffId ?? ''}>
            <option value="">{t('bl.staffAll')}</option>
            {staff.map(s => <option key={s.id} value={s.id}>{pick(lang, s.name, s.nameZh)}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor="f-status">{t('c.status')}</label>
          <select id="f-status" name="status" className="inp" defaultValue={f.status ?? ''}>
            <option value="">{t('bl.statusAll')}</option>
            {(['confirmed', 'completed', 'no_show', 'cancelled'] as const).map(s => <option key={s} value={s}>{t(`bs.${s}`)}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor="f-kind">{t('bl.colSource')}</label>
          <select id="f-kind" name="kind" className="inp" defaultValue={f.kind ?? ''}>
            <option value="">{t('bl.kindAll')}</option>
            {(['online', 'walkin', 'phone', 'block'] as const).map(k => <option key={k} value={k}>{t(`bk.${k}`)}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor="f-q">{t('c.search')}</label><input id="f-q" name="q" type="search" className="inp" defaultValue={f.q} placeholder={t('bl.searchPh')} /></div>
        <div className="flex items-end gap-2">
          <button className="btn btn-dark" type="submit">{t('bl.filter')}</button>
          {filtered && <Link href={`${base}?${qs({ staff: null, status: null, kind: null, q: null })}`} className="btn btn-ghost">{t('bl.reset')}</Link>}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
        <span><b className="text-ink">{t('bl.count', rows.length)}</b> · {fmtDate(f.from, lang, rangeFmt)} – {fmtDate(f.to, lang, rangeFmt)}</span>
        {shop.showPrices && total > 0 && <span>{t('cal.estPrice')}: <b className="tnum text-ink">{money(total, shop.currency)}</b></span>}
        {rows.length >= LIMIT && <span className="text-warn">{t('bl.limited', LIMIT)}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">{t('bl.empty')}</div>
      ) : (
        <>
          <div className="tbl-wrap hidden md:block">
            <table className="tbl">
              <thead><tr>
                <th>{t('bl.colWhen')}</th><th>{t('bl.colGuest')}</th><th>{t('bl.colServices')}</th><th>{t('rp.colStaff')}</th><th>{t('bl.colSource')}</th><th>{t('c.status')}</th><th className="r">{t('c.price')}</th>
              </tr></thead>
              <tbody>
                {rows.map(b => {
                  const st = staffById.get(b.staffId)
                  const href = `/dashboard/${shopId}?date=${b.date}&open=${b.id}`
                  return (
                    <tr key={b.id} className={b.status === 'cancelled' ? 'opacity-60' : ''}>
                      <td className="tnum whitespace-nowrap"><Link href={href} className="font-semibold">{fmtDate(b.date, lang)}</Link><br /><span className="text-muted">{fmtTime(b.startMin, lang)}–{fmtTime(b.endMin, lang)}</span></td>
                      <td>{b.kind === 'block' ? <span className="text-muted">{b.notes || t('bk.block')}</span> : <>{b.customerId ? <Link href={`/dashboard/${shopId}/customers/${b.customerId}`} className="font-semibold">{b.guestName}</Link> : <b>{b.guestName}</b>}<br /><span className="tnum text-[13px] text-muted">{b.guestPhone ?? ''} · {b.code}</span></>}</td>
                      <td className="max-w-[260px] text-[13.5px]">{(b.items ?? []).map(i => (i.kind === 'addon' ? '+ ' : '') + pick(lang, i.name, i.nameZh)).join(', ')}</td>
                      <td className="whitespace-nowrap"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: st?.color ?? '#999' }} />{st ? pick(lang, st.name, st.nameZh) : '—'}{b.anyStaff && <span className="ml-1 text-[12px] text-muted">({t('c.all')})</span>}</td>
                      <td className="whitespace-nowrap text-[13px]">{t(`bk.${b.kind}`)}</td>
                      <td><BookingStatusChip status={b.status} t={t} /></td>
                      <td className="r tnum">{money(b.estPriceCents, shop.currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map(b => {
              const st = staffById.get(b.staffId)
              const header = b.date !== lastDate
              lastDate = b.date
              return (
                <li key={b.id} className="flex flex-col gap-2">
                  {header && <div className="eyebrow mt-2">{fmtDate(b.date, lang, { weekday: 'long', month: 'short', day: 'numeric' })}</div>}
                  <Link href={`/dashboard/${shopId}?date=${b.date}&open=${b.id}`} className={`card flex gap-3 p-3 text-ink no-underline ${b.status === 'cancelled' ? 'opacity-60' : ''}`} style={{ borderLeft: `4px solid ${st?.color ?? '#999'}` }}>
                    <span className="tnum w-16 flex-none text-[13px] font-bold">{fmtTime(b.startMin, lang)}<br /><span className="font-normal text-muted">{fmtTime(b.endMin, lang)}</span></span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{b.kind === 'block' ? (b.notes || t('bk.block')) : b.guestName}</b>
                      <span className="block truncate text-[13px] text-muted">{(b.items ?? []).map(i => pick(lang, i.name, i.nameZh)).join(', ')}</span>
                      <span className="block text-[12.5px] text-muted">{st ? pick(lang, st.name, st.nameZh) : ''} · {t(`bk.${b.kind}`)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1"><BookingStatusChip status={b.status} t={t} /><span className="tnum text-[13px]">{money(b.estPriceCents, shop.currency)}</span></span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
