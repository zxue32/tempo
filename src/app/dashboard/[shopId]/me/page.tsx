import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff } from '@/lib/data/catalog'
import { shiftsInRange } from '@/lib/data/schedule'
import { dayBookings } from '@/lib/bookings'
import { sql } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { addDays, fmtDate, fmtDuration, fmtTime, isDateString, mondayOf, nowInZone } from '@/lib/tz'
import { BookingStatusChip } from '@/components/ui'
import { Initial } from '@/components/store'
import { MeActions } from './MeActions'
import { NailArt, describeDesign } from '@/components/NailArt'

export default async function MyDay(props: PageProps<'/dashboard/[shopId]/me'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  const { member } = await requireShop(shopId, 'staff')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const now = nowInZone(shop.timezone)
  const date = typeof sp.date === 'string' && isDateString(sp.date) ? sp.date : now.date
  const allStaff = await listStaff(shopId)
  const canPick = member.role !== 'staff'
  const picked = canPick && typeof sp.staff === 'string' ? allStaff.find(s => s.id === sp.staff) : undefined
  const me = picked ?? allStaff.find(s => s.id === member.staffId) ?? (canPick ? allStaff.find(s => s.active) : undefined)
  const base = `/dashboard/${shopId}/me`
  const link = (d: string) => `${base}?date=${d}${picked ? `&staff=${picked.id}` : ''}`

  if (!me) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('me.title')}</h1>
        <div className="card mt-4 p-6 text-muted">{canPick ? t('cal.noStaff') : t('me.notLinked')}</div>
      </div>
    )
  }

  const wk = mondayOf(date)
  const [shifts, bookings, weekCounts] = await Promise.all([
    shiftsInRange(shopId, wk, addDays(wk, 6)),
    dayBookings(shopId, date, me.id),
    sql<{ date: string; count: number }[]>`
      select date::text, count(*)::int as count from app.bookings
      where staff_id = ${me.id} and date between ${wk} and ${addDays(wk, 6)} and status in ('confirmed', 'completed') and kind <> 'block'
      group by date
    `,
  ])
  const counts = new Map(weekCounts.map(w => [w.date, w.count]))
  const shift = shifts.find(s => s.staffId === me.id && s.date === date)
  const workedDays = new Set(shifts.filter(s => s.staffId === me.id).map(s => s.date))
  const visible = bookings.filter(b => b.status !== 'cancelled')
  const cancelled = bookings.filter(b => b.status === 'cancelled')
  const clients = visible.filter(b => b.kind !== 'block')
  const totalMin = clients.reduce((a, b) => a + b.durationMin, 0)
  const isToday = date === now.date
  const next = isToday ? clients.find(b => b.status === 'confirmed' && b.endMin > now.min) : undefined
  const wdShort = t('c.weekdays').split(',')

  // Interleave free gaps (within the shift, outside breaks) between bookings.
  type Row = { kind: 'b'; b: (typeof visible)[number] } | { kind: 'gap'; from: number; to: number } | { kind: 'break'; from: number; to: number }
  const rows: Row[] = []
  if (shift) {
    const busy: Array<[number, number, Row]> = [
      ...visible.map(b => [b.startMin, b.endMin, { kind: 'b', b } as Row] as [number, number, Row]),
      ...shift.breaks.map(([f, e]) => [f, e, { kind: 'break', from: f, to: e } as Row] as [number, number, Row]),
    ].sort((a, b) => a[0] - b[0])
    let cur = shift.startMin
    for (const [s, e, row] of busy) {
      if (Math.min(s, shift.endMin) - cur >= 15) rows.push({ kind: 'gap', from: cur, to: Math.min(s, shift.endMin) })
      rows.push(row)
      cur = Math.max(cur, e)
    }
    if (shift.endMin - cur >= 15) rows.push({ kind: 'gap', from: cur, to: shift.endMin })
  } else {
    for (const b of visible) rows.push({ kind: 'b', b })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Initial name={pick(lang, me.name, me.nameZh)} color={me.color} photo={me.photoUrl} size={44} />
          <div>
            <h1 className="font-display text-[24px] font-extrabold leading-tight tracking-tight">{canPick && me.id !== member.staffId ? pick(lang, me.name, me.nameZh) : t('me.title')}</h1>
            <p className="text-[13.5px] text-muted">
              {me.id === member.staffId && <>{pick(lang, me.name, me.nameZh)} · </>}
              {shift ? t('me.shift', fmtTime(shift.startMin, lang), fmtTime(shift.endMin, lang)) : t('me.off')}
            </p>
          </div>
        </div>
        {canPick && (
          <form method="get" className="flex gap-2">
            <input type="hidden" name="date" value={date} />
            <select name="staff" aria-label={t('rp.colStaff')} className="inp inp-sm" defaultValue={me.id}>
              {allStaff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{pick(lang, s.name, s.nameZh)}</option>)}
            </select>
            <button className="btn btn-sm">{t('rp.show')}</button>
          </form>
        )}
      </div>

      <nav aria-label={t('me.week')} className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))_auto] items-stretch gap-1">
        <Link href={link(addDays(date, -7))} className="btn btn-sm btn-ghost !px-2" aria-label="‹">‹</Link>
        {Array.from({ length: 7 }, (_, i) => addDays(wk, i)).map(d => {
          const c = counts.get(d) ?? 0
          const sel = d === date
          return (
            <Link key={d} href={link(d)} aria-current={sel ? 'date' : undefined}
              className={`flex flex-col items-center rounded-xl border py-1.5 no-underline ${sel ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'} ${workedDays.has(d) ? '' : 'opacity-60'}`}>
              <span className="text-[11px] font-semibold">{wdShort[new Date(d + 'T12:00:00Z').getUTCDay()]}</span>
              <span className="tnum text-[16px] font-bold">{Number(d.slice(8))}</span>
              <span className={`tnum text-[10.5px] ${sel ? 'text-white/80' : 'text-muted'}`}>{workedDays.has(d) ? c || '·' : '—'}</span>
            </Link>
          )
        })}
        <Link href={link(addDays(date, 7))} className="btn btn-sm btn-ghost !px-2" aria-label="›">›</Link>
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold">{isToday ? t('c.today') + ' · ' : ''}{fmtDate(date, lang, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <span className="text-[13.5px] text-muted">{t('me.count', clients.length, fmtDuration(totalMin, lang))}</span>
      </div>
      {!isToday && <Link href={link(now.date)} className="self-start text-[13.5px]">← {t('c.today')}</Link>}

      {next && (
        <div className="rounded-2xl bg-ink p-4 text-white">
          <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-white/70">{next.startMin <= now.min ? t('me.now') : t('me.next')}</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <b className="text-[20px]">{next.guestName}</b>
            <span className="tnum text-[18px] font-bold">{fmtTime(next.startMin, lang)}</span>
          </div>
          <div className="text-[14px] text-white/80">{(next.items ?? []).map(i => (i.kind === 'addon' ? '+ ' : '') + pick(lang, i.name, i.nameZh)).join(', ')}</div>
        </div>
      )}

      {rows.length === 0 ? <div className="card p-6 text-center text-muted">{shift ? t('me.empty') : t('me.off')}</div> : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => {
            if (r.kind === 'gap') return <li key={'g' + i} className="tnum rounded-xl border border-dashed border-line px-4 py-2 text-[13px] text-muted">{fmtTime(r.from, lang)} · {t('me.free', fmtDuration(r.to - r.from, lang))}</li>
            if (r.kind === 'break') return <li key={'k' + i} className="tnum rounded-xl bg-sunk px-4 py-2 text-[13px] text-muted">{fmtTime(r.from, lang)}–{fmtTime(r.to, lang)} · {t('cal.legendOff')}</li>
            const b = r.b
            const past = isToday ? b.endMin <= now.min : date < now.date
            if (b.kind === 'block') return <li key={b.id} className="tnum rounded-xl bg-sunk px-4 py-2 text-[13px] text-muted">{fmtTime(b.startMin, lang)}–{fmtTime(b.endMin, lang)} · {b.notes || t('bk.block')}</li>
            return (
              <li key={b.id} className={`card flex flex-col gap-2 p-4 ${next?.id === b.id ? 'border-ink' : ''} ${b.status !== 'confirmed' ? 'opacity-75' : ''}`} style={{ borderLeft: `4px solid ${me.color}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="tnum text-[14px] font-bold">{fmtTime(b.startMin, lang)} – {fmtTime(b.endMin, lang)} <span className="font-normal text-muted">· {fmtDuration(b.durationMin, lang)}</span></div>
                    <b className="block truncate text-[17px]">{b.guestName}</b>
                  </div>
                  <span className="flex flex-col items-end gap-1">
                    <BookingStatusChip status={b.status} t={t} />
                    {b.status === 'confirmed' && b.clientConfirmedAt && <span className="chip chip-ok">☑ {t('cal.clientConfirmed')}</span>}
                    {b.actualStart && b.status === 'confirmed' && <span className="chip chip-accent">▶ {t('cal.startedAt', b.actualStart.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, hour: 'numeric', minute: '2-digit' }))}</span>}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {(b.items ?? []).map((it, k) => <li key={k} className="chip !h-auto py-1">{it.kind === 'addon' ? '+ ' : ''}{pick(lang, it.name, it.nameZh)}</li>)}
                </ul>
                {b.anyStaff && <span className="text-[12.5px] text-muted">{t('cal.anyStaff')}</span>}
                {b.notes && <p className="whitespace-pre-wrap rounded-lg bg-bg px-3 py-2 text-[14px]">“{b.notes}”</p>}
                {b.internalNote && <p className="whitespace-pre-wrap text-[13px] text-muted">{t('cal.internalNote')}: {b.internalNote}</p>}
                {b.design && <div className="flex items-center gap-3"><NailArt design={b.design} size={120} uid={'me' + b.id.slice(0, 6)} /><span className="text-[12.5px] text-muted">{describeDesign(b.design, t as (k: string) => string)}</span></div>}
                {b.photoUrl && (
                  <a href={b.photoUrl} target="_blank" rel="noreferrer" className="self-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.photoUrl} alt={t('cal.refPhoto')} className="h-24 w-24 rounded-lg border border-line object-cover" />
                  </a>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {b.guestPhone && <a href={`tel:${b.guestPhone}`} className="btn btn-sm">☎ {b.guestPhone}</a>}
                  {b.status === 'confirmed' && (isToday || past) && <MeActions shopId={shopId} bookingId={b.id} started={!!b.actualStart} />}
                  {canPick && <Link href={`/dashboard/${shopId}?date=${b.date}&open=${b.id}`} className="btn btn-sm btn-ghost">{t('bl.open')}</Link>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {cancelled.length > 0 && (
        <details className="text-[13.5px] text-muted">
          <summary className="cursor-pointer">{t('bs.cancelled')} ({cancelled.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">{cancelled.map(b => <li key={b.id} className="tnum">{fmtTime(b.startMin, lang)} · {b.guestName}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
