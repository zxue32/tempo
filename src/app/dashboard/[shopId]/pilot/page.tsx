import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listServices, listStaff } from '@/lib/data/catalog'
import { measuredDurations, funnel, currentMetrics, lastIntegrityRun, FUNNEL_STEPS } from '@/lib/data/pilot'
import { listWaitlist } from '@/lib/data/waitlist'
import { getT } from '@/lib/i18n/server'
import { pick, type DictKey } from '@/lib/i18n'
import { addDays, fmtDate, fmtTime, nowInZone } from '@/lib/tz'
import { BaselineForm, DoubleRunLog, RunCheck, ApplyDuration, RemoveWaiting } from './PilotForms'
import { Replay } from './Replay'

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x)}%`)
const num = (x: number | null | undefined, d = 1) => (x == null ? '—' : String(Math.round(x * 10 ** d) / 10 ** d))

export default async function PilotPage(props: PageProps<'/dashboard/[shopId]/pilot'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const from = addDays(today, -30), to = addDays(today, -1)
  const [now, steps, durations, check, waiting, staff, services] = await Promise.all([
    currentMetrics(shopId, from, to), funnel(shopId, 30), measuredDurations(shopId), lastIntegrityRun(shopId),
    listWaitlist(shopId, today), listStaff(shopId), listServices(shopId),
  ])
  const base = shop.pilotBaseline ?? {}
  const staffName = (id: string) => { const s = staff.find(x => x.id === id); return s ? pick(lang, s.name, s.nameZh) : '—' }
  const svcName = (id: string) => { const s = services.find(x => x.id === id); return s ? pick(lang, s.name, s.nameZh) : '—' }
  const rows: Array<{ label: DictKey; before: string; after: string; better: 'down' | 'up'; b?: number | null; a?: number | null }> = [
    { label: 'pi.mNoShow', before: pct(base.noShowPct), after: pct(now.noShowPct), better: 'down', b: base.noShowPct, a: now.noShowPct },
    { label: 'pi.mOnline', before: pct(base.onlinePct), after: pct(now.onlinePct), better: 'up', b: base.onlinePct, a: now.onlinePct },
    { label: 'pi.mCalls', before: num(base.callsPerDay), after: num(base.callsNow), better: 'down', b: base.callsPerDay, a: base.callsNow },
    { label: 'pi.mIdle', before: num(base.idleHoursPerDay), after: num(now.idleHoursPerDay), better: 'down', b: base.idleHoursPerDay, a: now.idleHoursPerDay },
  ]
  const top = Math.max(1, steps.store, steps.start)
  const checks = (base.checks ?? []).slice().sort((x, y) => y.date.localeCompare(x.date))
  let streak = 0
  for (const c of checks) { if (c.diffs === 0) streak++; else break }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('pi.title')}</h1>
        <p className="max-w-[75ch] text-muted">{t('pi.sub')}</p>
      </div>

      <section className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-bold">{t('pi.compare')}</h2>
          <span className="text-[13px] text-muted">{t('pi.compareRange', fmtDate(from, lang), fmtDate(to, lang))}</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t('pi.metric')}</th><th className="r">{t('pi.before')}</th><th className="r">{t('pi.after')}</th><th className="r">{t('pi.change')}</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const diff = r.b != null && r.a != null ? r.a - r.b : null
                const good = diff == null || diff === 0 ? null : (r.better === 'down') === diff < 0
                return (
                  <tr key={r.label}>
                    <td>{t(r.label)}</td>
                    <td className="r tnum">{r.before}</td>
                    <td className="r tnum font-semibold">{r.after}</td>
                    <td className={`r tnum ${good === true ? 'text-ok' : good === false ? 'text-bad' : 'text-muted'}`}>{diff == null ? '—' : `${diff > 0 ? '+' : ''}${num(diff)}`}</td>
                  </tr>
                )
              })}
              <tr><td>{t('pi.mConfirm')}</td><td className="r tnum text-muted">—</td><td className="r tnum font-semibold">{pct(now.confirmPct)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-muted">{t('pi.sample', now.settled, now.bookings)}</p>
        <BaselineForm shopId={shopId} baseline={base} />
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-[17px] font-bold">{t('pi.funnel')}</h2>
        <p className="text-[13.5px] text-muted">{t('pi.funnelD')}</p>
        <ol className="flex flex-col gap-2">
          {FUNNEL_STEPS.map((k, i) => {
            const n = steps[k]
            const prev = i > 0 ? steps[FUNNEL_STEPS[i - 1]] : null
            return (
              <li key={k} className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-[14px]">
                <span>{t(`pi.f.${k}` as DictKey)}</span>
                <span className="h-3 overflow-hidden rounded-full bg-sunk"><span className="block h-full rounded-full bg-accent" style={{ width: `${(n / top) * 100}%` }} /></span>
                <span className="tnum text-right"><b>{n}</b>{prev ? <span className="text-muted"> · {pct((n / prev) * 100)}</span> : null}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-bold">{t('pi.double')}</h2>
          <Link href={`/dashboard/${shopId}/print?date=${today}`} className="btn btn-sm">{t('pi.print')}</Link>
        </div>
        <p className="text-[13.5px] text-muted">{t('pi.doubleD')}</p>
        {checks.length > 0 && <p className="text-[14px]"><b>{t('pi.streak', streak)}</b> · {t('pi.checked', checks.length)}</p>}
        <DoubleRunLog shopId={shopId} baseline={base} today={today} />
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-[17px] font-bold">{t('rpl.title')}</h2>
        <p className="text-[13.5px] text-muted">{t('rpl.d')}</p>
        <Replay shopId={shopId} example={(() => {
          const st = staff.find(s => s.active)?.name ?? 'Mia'
          const sv = services.filter(s => s.kind === 'service' && s.active).slice(0, 2)
          const ad = services.find(s => s.kind === 'addon' && s.active)
          const d = addDays(today, -7)
          return [`${d},10:00,10:45,${st},${sv[0]?.name ?? 'Gel Manicure'}`, `${d},11:00,,${st},${sv[1]?.name ?? sv[0]?.name ?? 'Gel Manicure'}${ad ? ' + ' + ad.name : ''}`].join('\n')
        })()} />
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-[17px] font-bold">{t('pi.durations')}</h2>
        <p className="text-[13.5px] text-muted">{t('pi.durationsD')}</p>
        {durations.length === 0 ? <p className="text-[14px] text-muted">{t('pi.durationsEmpty')}</p> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t('rp.colStaff')}</th><th>{t('bl.colServices')}</th><th className="r">{t('pi.n')}</th><th className="r">P50</th><th className="r">P80</th><th className="r">{t('pi.setting')}</th><th /></tr></thead>
              <tbody>
                {durations.map(d => {
                  const suggest = Math.round(d.p80 / 5) * 5
                  const off = Math.abs(suggest - d.current) >= 10
                  return (
                    <tr key={d.staffId + d.serviceId}>
                      <td>{staffName(d.staffId)}</td>
                      <td>{svcName(d.serviceId)}</td>
                      <td className="r tnum">{d.n}</td>
                      <td className="r tnum">{d.p50}′</td>
                      <td className="r tnum font-semibold">{d.p80}′</td>
                      <td className={`r tnum ${off ? 'text-warn' : ''}`}>{d.current}′</td>
                      <td className="r">{d.n >= 5 && off ? <ApplyDuration shopId={shopId} staffId={d.staffId} serviceId={d.serviceId} minutes={suggest} /> : d.n < 5 ? <span className="text-[12px] text-muted">{t('pi.needMore', 5 - d.n)}</span> : <span className="text-[12px] text-ok">✓</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-bold">{t('pi.check')}</h2>
          <RunCheck shopId={shopId} />
        </div>
        <p className="text-[13.5px] text-muted">{t('pi.checkD')}</p>
        {!check ? <p className="text-[14px] text-muted">{t('pi.checkNever')}</p> : (
          <div className="flex flex-col gap-2 text-[14px]">
            <p className={check.ok ? 'font-semibold text-ok' : 'font-semibold text-bad'}>
              {check.ok ? '✓ ' + t('pi.checkOk') : '✕ ' + t('pi.checkBad')} · <span className="font-normal text-muted">{check.at.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, dateStyle: 'medium', timeStyle: 'short' })}</span>
            </p>
            {check.issues.map(i => (
              <div key={i.code} className={`rounded-lg px-3 py-2 ${i.level === 'error' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'}`}>
                <b>{t(`pi.i.${i.code}` as DictKey, i.count)}</b>
                <span className="ml-2">{i.sample.map(x => <Link key={x.id} href={`/dashboard/${shopId}?date=${x.date}&open=${x.id}`} className="mr-2 underline">{fmtDate(x.date, lang)} {fmtTime(x.start, lang)}</Link>)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-[17px] font-bold">{t('pi.waitlist')}</h2>
        {!shop.waitlistEnabled && <p className="text-[13.5px] text-muted">{t('pi.waitlistOff')}</p>}
        {waiting.length === 0 ? <p className="text-[14px] text-muted">{t('pi.waitlistEmpty')}</p> : (
          <ul className="flex flex-col divide-y divide-line-soft">
            {waiting.map(w => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-2 text-[14px]">
                <span className="tnum w-36">{fmtDate(w.date, lang)} · {w.fromMin === 0 && w.toMin === 1440 ? t('bf.wAny') : `${fmtTime(w.fromMin, lang)}–${fmtTime(w.toMin, lang)}`}</span>
                <b className="min-w-0 flex-1 truncate">{w.name} <span className="font-normal text-muted">· {w.serviceIds.map(svcName).join(' + ')}{w.staffId ? ' · ' + staffName(w.staffId) : ''}</span></b>
                <span className="text-muted">{w.phone || w.email}</span>
                {w.status === 'notified' && <span className="chip chip-ok">{t('pi.notified')}</span>}
                <RemoveWaiting shopId={shopId} id={w.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
