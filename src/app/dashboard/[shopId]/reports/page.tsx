import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { buildReport } from '@/lib/data/insights'
import { monthRange } from '@/lib/filters'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { addDays, diffDays, fmtDate, isDateString, mondayOf, nowInZone } from '@/lib/tz'
import { money } from '@/components/ui'

const pct = (x: number | null) => (x == null ? '—' : x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`)
const hours = (min: number) => (Math.round(min / 6) / 10).toString()

export default async function ReportsPage(props: PageProps<'/dashboard/[shopId]/reports'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const wk = mondayOf(today)
  const presets = {
    week: { from: wk, to: addDays(wk, 6), label: t('rp.thisWeek') },
    month: { ...monthRange(today), label: t('rp.thisMonth') },
    last: { ...monthRange(today, -1), label: t('rp.lastMonth') },
  }
  const p = typeof sp.p === 'string' && sp.p in presets ? (sp.p as keyof typeof presets) : null
  let from = p ? presets[p].from : typeof sp.from === 'string' && isDateString(sp.from) ? sp.from : presets.month.from
  let to = p ? presets[p].to : typeof sp.to === 'string' && isDateString(sp.to) ? sp.to : presets.month.to
  if (to < from) [from, to] = [to, from]
  if (diffDays(to, from) > 366) to = addDays(from, 366)
  const active = p ?? (typeof sp.from === 'string' ? 'custom' : 'month')
  const r = await buildReport(shopId, from, to)
  const { totals } = r
  const base = `/dashboard/${shopId}/reports`
  const settled = totals.completed + totals.noShows
  const noShowRate = settled ? totals.noShows / settled : null
  const sourceTotal = r.sources.reduce((a, s) => a + s.count, 0)
  const nrTotal = r.newReturning.newCount + r.newReturning.returningCount
  const maxDay = Math.max(1, ...r.byDay.map(d => d.count))
  const days = diffDays(to, from) + 1
  const dayMap = new Map(r.byDay.map(d => [d.date, d.count]))
  const totalComm = r.staff.reduce((a, s) => a + Math.round(s.revenueCents * s.commissionPct / 100), 0)
  const empty = totals.total === 0

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('rp.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <nav className="seg" aria-label={t('bl.range')}>
          {(Object.keys(presets) as Array<keyof typeof presets>).map(k => (
            <Link key={k} href={`${base}?p=${k}`} aria-current={active === k ? 'page' : undefined} className="no-underline">{presets[k].label}</Link>
          ))}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div><label className="lbl" htmlFor="r-from">{t('c.from')}</label><input id="r-from" name="from" type="date" className="inp inp-sm tnum" defaultValue={from} /></div>
          <div><label className="lbl" htmlFor="r-to">{t('c.to')}</label><input id="r-to" name="to" type="date" className="inp inp-sm tnum" defaultValue={to} /></div>
          <button className={`btn btn-sm ${active === 'custom' ? 'btn-dark' : ''}`}>{t('rp.show')}</button>
        </form>
      </div>
      <p className="text-[14px] text-muted">{fmtDate(from, lang, { year: 'numeric', month: 'short', day: 'numeric' })} – {fmtDate(to, lang, { year: 'numeric', month: 'short', day: 'numeric' })}</p>

      {empty ? <div className="card p-8 text-center text-muted">{t('rp.empty')}</div> : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t('rp.bookings')} value={totals.total} sub={t('rp.guests') + ' ' + totals.guests} />
            <Kpi label={t('rp.completed')} value={totals.completed} sub={totals.upcoming ? t('rp.upcoming', totals.upcoming) : undefined} />
            <Kpi label={t('rp.noShows')} value={totals.noShows} sub={t('rp.noShowRate', pct(noShowRate))} warn={!!totals.noShows} />
            <Kpi label={t('rp.cancelled')} value={totals.cancelled} />
            <Kpi label={t('rp.revenue')} value={money(totals.revenueCents, shop.currency)} sub={totals.upcomingCents ? t('rp.upcoming', money(totals.upcomingCents, shop.currency)) : undefined} />
            <Kpi label={t('rp.utilization')} value={pct(r.utilization)} />
          </dl>
          <p className="text-[12.5px] text-muted">{t('rp.estNote')}</p>

          <section className="flex flex-col gap-2">
            <h2 className="text-[17px] font-bold">{t('rp.byStaff')}</h2>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>{t('rp.colStaff')}</th><th className="r">{t('rp.colDone')}</th><th className="r">{t('rp.colHours')}</th><th className="r">{t('rp.colRev')}</th>
                  <th className="r">{t('rp.colPct')}</th><th className="r">{t('rp.colComm')}</th><th className="r">{t('rp.colNoShow')}</th><th>{t('rp.colUtil')}</th>
                </tr></thead>
                <tbody>
                  {r.staff.map(s => {
                    const util = s.shiftMin ? s.bookedMin / s.shiftMin : null
                    return (
                      <tr key={s.id}>
                        <td className="whitespace-nowrap"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: s.color }} /><b>{pick(lang, s.name, s.nameZh)}</b></td>
                        <td className="r tnum">{s.completed}</td>
                        <td className="r tnum">{hours(s.serviceMin)}</td>
                        <td className="r tnum">{money(s.revenueCents, shop.currency)}</td>
                        <td className="r tnum">{s.commissionPct}%</td>
                        <td className="r tnum font-semibold">{money(Math.round(s.revenueCents * s.commissionPct / 100), shop.currency)}</td>
                        <td className={`r tnum ${s.noShows ? 'text-warn' : 'text-muted'}`}>{s.noShows}</td>
                        <td className="min-w-[150px]">
                          <div className="flex items-center gap-2">
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunk"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (util ?? 0) * 100)}%`, background: s.color }} /></span>
                            <span className="tnum w-10 text-right text-[13px]">{pct(util)}</span>
                          </div>
                          <span className="text-[11.5px] text-muted">{t('rp.ofShift', t('rp.hoursUnit', hours(s.bookedMin)), t('rp.hoursUnit', hours(s.shiftMin)))}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="font-bold">
                    <td>{t('c.total')}</td>
                    <td className="r tnum">{totals.completed}</td>
                    <td className="r tnum">{hours(r.staff.reduce((a, s) => a + s.serviceMin, 0))}</td>
                    <td className="r tnum">{money(totals.revenueCents, shop.currency)}</td>
                    <td />
                    <td className="r tnum">{money(totalComm, shop.currency)}</td>
                    <td className="r tnum">{totals.noShows}</td>
                    <td className="tnum">{pct(r.utilization)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-[17px] font-bold">{t('rp.perDay')}</h2>
            {days <= 62 ? (
              <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={t('rp.perDay')}>
                {Array.from({ length: days }, (_, i) => addDays(from, i)).map(d => {
                  const c = dayMap.get(d) ?? 0
                  return (
                    <div key={d} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${fmtDate(d, lang)}: ${c}`}>
                      <div className="rounded-t-[3px] bg-accent" style={{ height: `${(c / maxDay) * 100}%`, minHeight: c ? 3 : 0, opacity: d > today ? 0.45 : 1 }} />
                      {days <= 14 && <span className="tnum mt-1 text-center text-[10.5px] text-muted">{fmtDate(d, lang, { weekday: 'narrow' })}</span>}
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-[13.5px] text-muted">{r.byDay.length} / {days}</p>}
            {days > 14 && days <= 62 && (
              <div className="tnum flex justify-between text-[11.5px] text-muted"><span>{fmtDate(from, lang)}</span><span>{fmtDate(to, lang)}</span></div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-[17px] font-bold">{t('rp.popular')}</h2>
              <ol className="flex flex-col gap-2">
                {r.popular.map((s, i) => (
                  <li key={s.name + s.kind} className="flex items-center gap-2 text-[14px]">
                    <span className="tnum w-5 text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.kind === 'addon' ? '+ ' : ''}{pick(lang, s.name, s.nameZh)}</span>
                    <b className="tnum">{s.count}</b>
                  </li>
                ))}
              </ol>
            </section>
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-[17px] font-bold">{t('rp.sources')}</h2>
              <ul className="flex flex-col gap-3">
                {r.sources.map(s => (
                  <li key={s.kind} className="flex flex-col gap-1 text-[14px]">
                    <span className="flex justify-between"><span>{t(`bk.${s.kind}`)}</span><b className="tnum">{s.count} · {pct(s.count / sourceTotal)}</b></span>
                    <span className="h-2 overflow-hidden rounded-full bg-sunk"><span className="block h-full rounded-full bg-ink" style={{ width: `${(s.count / sourceTotal) * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-[17px] font-bold">{t('rp.newReturning')}</h2>
              {nrTotal === 0 ? <p className="text-muted">—</p> : (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-sunk">
                    <span className="bg-accent" style={{ width: `${(r.newReturning.newCount / nrTotal) * 100}%` }} />
                    <span className="bg-ink" style={{ width: `${(r.newReturning.returningCount / nrTotal) * 100}%` }} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-[14px]">
                    <div><dt className="flex items-center gap-1.5 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-accent" />{t('rp.new')}</dt><dd className="tnum text-[20px] font-bold">{r.newReturning.newCount} <span className="text-[13px] font-normal text-muted">{pct(r.newReturning.newCount / nrTotal)}</span></dd></div>
                    <div><dt className="flex items-center gap-1.5 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-ink" />{t('rp.returning')}</dt><dd className="tnum text-[20px] font-bold">{r.newReturning.returningCount} <span className="text-[13px] font-normal text-muted">{pct(r.newReturning.returningCount / nrTotal)}</span></dd></div>
                  </dl>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={`tnum text-[26px] font-extrabold leading-tight ${warn ? 'text-warn' : ''}`}>{value}</dd>
      {sub && <dd className="text-[12px] text-muted">{sub}</dd>}
    </div>
  )
}
