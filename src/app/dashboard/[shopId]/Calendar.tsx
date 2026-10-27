'use client'
import { NailArt, describeDesign } from '@/components/NailArt'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { Panel, useToast, errText, timeOptions, ServiceChecklist } from '@/components/dash'
import { BookingStatusChip, money } from '@/components/ui'
import { blocker, guestDuration, type EngineDay, type EngineStaff } from '@/lib/engine'
import { addDays, fmtDate, fmtTime, fmtTimeShort, fmtDuration } from '@/lib/tz'
import { pick, type DictKey } from '@/lib/i18n'
import type { Booking, Service, Shift, Skill, Staff, Industry, BookingStatus } from '@/lib/types'
import {
  createBookingAction, bookingDetail, setBookingStatusAction, moveBookingAction, setItemsAction, markStartedAction,
  updateBookingDetailsAction, findCustomerByPhone,
} from './actions'

type ShopLite = { id: string; industry: Industry; slotMinutes: number; bufferMinutes: number; maxGuests: number; timezone: string }
type Props = {
  shop: ShopLite
  date: string
  today: string
  nowMin: number
  hours: { open: number; close: number } | null
  staff: Staff[]
  services: Service[]
  skills: Skill[]
  shifts: Shift[]
  bookings: Booking[]
  openId: string | null
}

const ROW = 14 // px per 15 minutes
const busyEnd = (b: Booking) => b.startMin + Math.round((new Date(b.busyUntil).getTime() - new Date(b.startsAt).getTime()) / 60000)
const ACTIVE = new Set<BookingStatus>(['confirmed', 'completed'])

export function Calendar(props: Props) {
  const { shop, date, today, nowMin, hours, staff, services, skills, shifts, bookings } = props
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [panel, setPanel] = useState<{ type: 'add'; staffId: string; start: number } | { type: 'detail'; id: string } | null>(props.openId ? { type: 'detail', id: props.openId } : null)

  const columns = useMemo(() => staff.filter(s => s.active || bookings.some(b => b.staffId === s.id)), [staff, bookings])
  const day: EngineDay = useMemo(() => {
    const svc = new Map(services.filter(s => s.active).map(s => [s.id, { id: s.id, kind: s.kind, category: s.category, duration: s.durationMin }]))
    return {
      date, hours, slot: shop.slotMinutes, buffer: shop.bufferMinutes, earliest: -Infinity, services: svc,
      staff: staff.map((st): EngineStaff => {
        const sh = shifts.find(x => x.staffId === st.id)
        const sk = new Map<string, number | null>()
        for (const k of skills) if (k.staffId === st.id) sk.set(k.serviceId, k.durationMin)
        return {
          id: st.id, sort: st.sort, online: true, skills: sk,
          shift: sh ? { start: sh.startMin, end: sh.endMin, breaks: sh.breaks } : null,
          busy: bookings.filter(b => b.staffId === st.id && ACTIVE.has(b.status)).map(b => [b.startMin, busyEnd(b), b.id] as [number, number, string]),
        }
      }),
    }
  }, [date, hours, shop.slotMinutes, shop.bufferMinutes, services, staff, shifts, skills, bookings])

  const range = useMemo(() => {
    let lo = hours?.open ?? 600, hi = hours?.close ?? 1140
    for (const s of shifts) { lo = Math.min(lo, s.startMin); hi = Math.max(hi, s.endMin) }
    for (const b of bookings) { lo = Math.min(lo, b.startMin); hi = Math.max(hi, b.endMin) }
    return { start: Math.floor(lo / 60) * 60, end: Math.min(1440, Math.ceil(hi / 60) * 60) }
  }, [hours, shifts, bookings])
  const rows = (range.end - range.start) / 15
  const y = (m: number) => ((m - range.start) / 15) * ROW

  const go = (d: string) => router.push(`?date=${d}`)
  const done = (msg?: string) => { setPanel(null); router.refresh(); if (msg) toast.show(msg) }

  const hourMarks: number[] = []
  for (let m = range.start; m < range.end; m += 60) hourMarks.push(m)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => go(addDays(date, -1))} aria-label="Previous day">‹</button>
        <h1 className="font-display min-w-0 text-[24px] font-extrabold">{fmtDate(date, lang, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
        <button className="btn btn-sm" onClick={() => go(addDays(date, 1))} aria-label="Next day">›</button>
        {date !== today && <button className="btn btn-sm btn-ghost" onClick={() => go(today)}>{t('c.today')}</button>}
        <input type="date" aria-label={t('c.date')} className="inp inp-sm !w-auto" value={date} onChange={e => e.target.value && go(e.target.value)} />
        <span className="flex-1" />
        {columns.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => {
            const st = columns.find(c => c.active) || columns[0]
            const base = date === today ? Math.ceil(nowMin / 15) * 15 : (hours?.open ?? 600)
            setPanel({ type: 'add', staffId: st.id, start: Math.min(Math.max(base, range.start), range.end - 15) })
          }}>+ {t('cal.newBooking')}</button>
        )}
      </div>
      <p className="text-[13px] text-muted">{hours ? t('cal.hint') : t('cal.closedDay')}</p>

      {columns.length === 0 ? (
        <div className="card p-8 text-center text-muted">{t('cal.noStaff')}</div>
      ) : (
        <div className="tbl-wrap max-h-[75vh] !overflow-auto">
          <div className="grid min-w-max" style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(150px, 1fr))` }}>
            <div className="sticky left-0 top-0 z-20 border-b border-line bg-surface" />
            {columns.map(st => {
              const sh = shifts.find(s => s.staffId === st.id)
              return (
                <div key={st.id} className="sticky top-0 z-10 border-b border-l border-line bg-surface px-2.5 py-2">
                  <div className="flex items-center gap-2 text-[14px] font-bold"><span className="nail" style={{ ['--c' as string]: st.color }} />{pick(lang, st.name, st.nameZh)}</div>
                  <div className="tnum text-[11.5px] text-muted">{sh ? `${fmtTimeShort(sh.startMin, lang)}–${fmtTimeShort(sh.endMin, lang)}` : t('cal.offDay')}</div>
                </div>
              )
            })}
            <div className="sticky left-0 z-10 bg-surface" style={{ height: rows * ROW }}>
              {hourMarks.map(m => (
                <span key={m} className="tnum absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: y(m) || 6 }}>{fmtTimeShort(m, lang)}</span>
              ))}
            </div>
            {columns.map(st => {
              const sh = shifts.find(s => s.staffId === st.id)
              const mine = bookings.filter(b => b.staffId === st.id && b.status !== 'cancelled')
              return (
                <div key={st.id} className="hatch relative cursor-copy border-l border-line" style={{ height: rows * ROW, backgroundSize: 'auto' }}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('[data-ev]')) return
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                    const start = range.start + Math.max(0, Math.floor((e.clientY - rect.top) / ROW)) * 15
                    setPanel({ type: 'add', staffId: st.id, start })
                  }}>
                  {hourMarks.map(m => <span key={m} className="pointer-events-none absolute inset-x-0 border-t border-line-soft" style={{ top: y(m) }} />)}
                  {sh && hours && (
                    <span className="pointer-events-none absolute inset-x-0 bg-surface/95" style={{ top: y(Math.max(sh.startMin, hours.open, range.start)), height: Math.max(0, y(Math.min(sh.endMin, hours.close)) - y(Math.max(sh.startMin, hours.open, range.start))) }} />
                  )}
                  {sh?.breaks.map(b => (
                    <span key={b[0]} className="pointer-events-none absolute inset-x-0" style={{ top: y(b[0]), height: y(b[1]) - y(b[0]), backgroundImage: 'repeating-linear-gradient(135deg, rgba(22,23,27,.13) 0 2px, transparent 2px 5px)' }} />
                  ))}
                  {mine.map(b => <Event key={b.id} b={b} color={st.color} top={y(b.startMin)} height={Math.max(ROW * 1.4, y(b.endMin) - y(b.startMin))} onOpen={() => setPanel({ type: 'detail', id: b.id })} now={date === today ? nowMin : null} />)}
                  {date === today && nowMin > range.start && nowMin < range.end && (
                    <span className="pointer-events-none absolute inset-x-0 z-[2] h-[2px] bg-accent" style={{ top: y(nowMin) }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <Legend style={{ background: '#C8445A' }} label={t('cal.legendNow')} />
        <Legend style={{ background: 'color-mix(in srgb,#C8445A 16%,white)', border: '1px solid color-mix(in srgb,#C8445A 50%,white)' }} label={t('cal.legendBooked')} />
        <Legend style={{ background: '#F3F4F6', border: '1px solid #DADDE3' }} label={t('cal.legendDone')} />
        <Legend style={{ border: '1.5px dashed #8A4F00' }} label={t('cal.legendNoShow')} />
        <Legend className="hatch" style={{ border: '1px solid #DADDE3' }} label={t('cal.legendOff')} />
      </div>

      {panel?.type === 'add' && (
        <AddPanel shop={shop} date={date} day={day} range={range} staff={columns.filter(c => c.active)} services={services} skills={skills}
          initialStaff={panel.staffId} initialStart={panel.start} onClose={() => setPanel(null)} onDone={() => done(t('c.saved'))} />
      )}
      {panel?.type === 'detail' && (
        <DetailPanel shop={shop} id={panel.id} staff={staff} services={services} range={range} onClose={() => setPanel(null)} onDone={m => done(m)} />
      )}
      {toast.node}
    </div>
  )
}

function Legend({ style, label, className = '' }: { style: React.CSSProperties; label: string; className?: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-4 rounded-[3px] ${className}`} style={style} />{label}</span>
}

function Event({ b, color, top, height, onOpen, now }: { b: Booking; color: string; top: number; height: number; onOpen: () => void; now: number | null }) {
  const { t, lang } = useI18n()
  const live = b.status === 'confirmed' && now != null && now >= b.startMin && now < b.endMin
  let style: React.CSSProperties = { background: `color-mix(in srgb, ${color} 15%, white)`, border: `1px solid color-mix(in srgb, ${color} 50%, white)`, color: '#16171B' }
  if (live) style = { background: color, border: `1px solid ${color}`, color: '#fff' }
  if (b.status === 'completed') style = { background: '#F3F4F6', border: '1px solid #DADDE3', color: '#575B65' }
  if (b.status === 'no_show') style = { background: '#fff', border: '1.5px dashed #8A4F00', color: '#7A4700' }
  if (b.kind === 'block') style = { backgroundImage: 'repeating-linear-gradient(135deg,#EBEDF1 0 6px,#fff 6px 12px)', border: '1px solid #DADDE3', color: '#575B65' }
  const items = (b.items ?? []).map(i => pick(lang, i.name, i.nameZh)).join(' + ')
  return (
    <button type="button" data-ev onClick={onOpen} className="absolute inset-x-1 z-[1] overflow-hidden rounded-lg px-2 py-1 text-left text-[12px] leading-tight hover:shadow-md" style={{ top: top + 1, height: height - 2, ...style }}>
      <span className="tnum block text-[11px] opacity-80">{fmtTime(b.startMin, lang)}–{fmtTime(b.endMin, lang)}{b.status === 'completed' ? ' ✓' : b.actualStart ? ' ▶' : ''}{b.status === 'confirmed' && b.clientConfirmedAt ? ' ☑' : ''}</span>
      <b className="block truncate">{b.kind === 'block' ? (b.notes || t('bk.block')) : b.guestName || t(`bk.${b.kind}`)}</b>
      {b.kind !== 'block' && <span className="block truncate opacity-85">{items}</span>}
    </button>
  )
}

// ---------------------------------------------------------------- quick add

function AddPanel({ shop, date, day, range, staff, services, skills, initialStaff, initialStart, onClose, onDone }: {
  shop: ShopLite; date: string; day: EngineDay; range: { start: number; end: number }; staff: Staff[]; services: Service[]; skills: Skill[]
  initialStaff: string; initialStart: number; onClose: () => void; onDone: () => void
}) {
  const { t, lang } = useI18n()
  const [kind, setKind] = useState<'walkin' | 'phone' | 'block'>('walkin')
  const [staffId, setStaffId] = useState(initialStaff)
  const [start, setStart] = useState(initialStart)
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [blockMin, setBlockMin] = useState(30)
  const [force, setForce] = useState(false)
  const [known, setKnown] = useState<{ name: string; visits: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  const st = day.staff.find(s => s.id === staffId)
  const guest = { serviceIds: selected.filter(id => services.find(s => s.id === id)?.kind === 'service'), addonIds: selected.filter(id => services.find(s => s.id === id)?.kind === 'addon'), staffId }
  const duration = kind === 'block' ? blockMin : (st && guest.serviceIds.length ? guestDuration(day, st, guest) : null) ?? 0
  const why = !st ? 'invalid' : kind !== 'block' && !guest.serviceIds.length ? 'invalid' : blocker(kind === 'block' ? { ...day, buffer: 0 } : day, st, start, duration, new Set(), { ignoreShift: kind === 'block' })
  const lacksSkill = kind !== 'block' && st && guest.serviceIds.some(id => !st.skills.has(id))
  const needsForce = why === 'shift' || why === 'break' || why === 'off' || why === 'closed'
  const blocked = why === 'booked' || why === 'invalid'
  const staffDur = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const k of skills) if (k.staffId === staffId) m.set(k.serviceId, k.durationMin)
    return m
  }, [skills, staffId])
  const est = selected.reduce((sum, id) => sum + (services.find(s => s.id === id)?.priceCents ?? 0), 0)

  useEffect(() => { setForce(false) }, [staffId, start, kind])

  const submit = () => startT(async () => {
    setErr(null)
    const r = await createBookingAction(shop.id, {
      kind, date, start, force: needsForce && force,
      guests: kind === 'block' ? [] : [guest],
      block: kind === 'block' ? { staffId, minutes: blockMin } : undefined,
      contact: kind === 'block' ? undefined : { name, phone, email },
      notes,
    })
    if (r.ok) onDone()
    else setErr(errText(t, r.error, r.detail))
  })

  return (
    <Panel title={t('cal.addTitle')} eyebrow={fmtDate(date, lang)} onClose={onClose}>
      <div className="seg self-start" role="radiogroup" aria-label={t('cal.kind')}>
        {(['walkin', 'phone', 'block'] as const).map(k => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{t(`bk.${k}`)}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="lbl" htmlFor="qa-staff">{t(`staffWord.${shop.industry}`)}</label>
          <select id="qa-staff" className="inp" value={staffId} onChange={e => setStaffId(e.target.value)}>
            {staff.map(s => <option key={s.id} value={s.id}>{pick(lang, s.name, s.nameZh)}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="qa-start">{t('c.start')}</label>
          <select id="qa-start" className="inp tnum" value={start} onChange={e => setStart(+e.target.value)}>
            {timeOptions(Math.min(range.start, start), Math.max(range.end - 5, start), 5, lang).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      {kind === 'block' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl" htmlFor="qa-min">{t('cal.blockMinutes')}</label>
            <select id="qa-min" className="inp" value={blockMin} onChange={e => setBlockMin(+e.target.value)}>
              {[15, 30, 45, 60, 90, 120, 180, 240, 480].map(m => <option key={m} value={m}>{fmtDuration(m, lang)}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="qa-reason">{t('cal.blockReason')}</label>
            <input id="qa-reason" className="inp" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('cal.blockReasonPh')} />
          </div>
        </div>
      ) : (
        <>
          <ServiceChecklist services={services} selected={selected} idPrefix="qa" staffDurations={staffDur}
            onToggle={id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="lbl" htmlFor="qa-phone">{t('c.phone')}</label>
              <input id="qa-phone" type="tel" className="inp" value={phone} onChange={e => setPhone(e.target.value)}
                onBlur={async () => {
                  const c = phone.replace(/\D/g, '').length >= 7 ? await findCustomerByPhone(shop.id, phone) : null
                  setKnown(c ? { name: c.name, visits: c.visits } : null)
                  if (c) { if (!name) setName(c.name); if (!email && c.email) setEmail(c.email) }
                }} />
            </div>
            <div>
              <label className="lbl" htmlFor="qa-name">{t('c.name')}</label>
              <input id="qa-name" className="inp" value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'walkin' ? t('bk.walkin') : ''} />
            </div>
            <div className="sm:col-span-2">
              <label className="lbl" htmlFor="qa-email">{t('c.email')} <span className="font-normal">({t('c.optional')})</span></label>
              <input id="qa-email" type="email" className="inp" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="lbl" htmlFor="qa-notes">{t('c.notes')}</label>
              <input id="qa-notes" className="inp" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {known && <p className="chip chip-accent self-start">{t('cal.existing', known.name, known.visits)}</p>}
        </>
      )}
      <div className="card flex flex-col gap-1 px-4 py-3 text-[14px]">
        {duration > 0 && <span className="tnum">{fmtTime(start, lang)}–{fmtTime(start + duration, lang)} · {fmtDuration(duration, lang)}{est > 0 && kind !== 'block' ? ` · ${money(est)}` : ''}</span>}
        <span className={why ? (needsForce ? 'font-semibold text-warn' : 'err') : 'font-semibold text-ok'}>{why ? t(`cal.why.${why}` as DictKey) : '✓ ' + t('cal.fits')}</span>
        {lacksSkill && <span className="font-semibold text-warn">{t('cal.why.skill')}</span>}
        {needsForce && <label className="chk mt-1 text-[13px]"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />{t('cal.force')}</label>}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending || blocked || (needsForce && !force)} onClick={submit}>{pending ? '…' : t('cal.create')}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t('c.cancel')}</button>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- detail

type Detail = NonNullable<Awaited<ReturnType<typeof bookingDetail>>>

function DetailPanel({ shop, id, staff, services, range, onClose, onDone }: {
  shop: ShopLite; id: string; staff: Staff[]; services: Service[]; range: { start: number; end: number }; onClose: () => void; onDone: (msg?: string) => void
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [d, setD] = useState<Detail | null | 'missing'>(null)
  const [mode, setMode] = useState<'view' | 'move' | 'items' | 'cancel' | 'edit'>('view')
  const [err, setErr] = useState<string | null>(null)
  const [pending, startT] = useTransition()
  const load = () => bookingDetail(shop.id, id).then(r => setD(r ?? 'missing'))
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (d === null) return <Panel title={t('cal.detail')} onClose={onClose}><p className="text-muted">{t('c.loading')}</p></Panel>
  if (d === 'missing') return <Panel title={t('cal.detail')} onClose={onClose}><p className="text-muted">{t('c.notFound')}</p></Panel>
  const b = d.booking
  const st = staff.find(s => s.id === b.staffId)
  const run = (fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>, msg?: string, stay = false) => startT(async () => {
    setErr(null)
    const r = await fn()
    if (!r.ok) { setErr(errText(t, r.error || 'server', r.detail)); return }
    // "start" keeps the panel open so the same person can tap "done" later
    if (stay) { await load(); router.refresh() } else onDone(msg ?? t('c.saved'))
  })
  const isBlock = b.kind === 'block'
  const items = b.items ?? []
  const est = items.reduce((s, i) => s + (i.priceCents ?? 0), 0)

  return (
    <Panel title={isBlock ? (b.notes || t('bk.block')) : b.guestName || t(`bk.${b.kind}`)} eyebrow={fmtDate(b.date, lang, { weekday: 'long', month: 'long', day: 'numeric' })} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <BookingStatusChip status={b.status} t={t} />
        <span className="chip">{t(`bk.${b.kind}`)}</span>
        {d.groupSize > 1 && <span className="chip">{t('cal.groupOf', d.groupSize)}</span>}
        {b.anyStaff && <span className="chip">{t('cal.anyStaff')}</span>}
        {!isBlock && b.status === 'confirmed' && (b.clientConfirmedAt
          ? <span className="chip chip-ok">☑ {t('cal.clientConfirmed')}</span>
          : d.reminderSent ? <span className="chip chip-warn">{t('cal.notConfirmed')}</span> : null)}
        {b.actualStart && <span className="chip chip-accent">▶ {t('cal.startedAt', new Date(b.actualStart).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, hour: 'numeric', minute: '2-digit' }))}</span>}
      </div>
      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px]">
        <dt className="text-muted">{t('c.time')}</dt><dd className="tnum">{fmtTime(b.startMin, lang)}–{fmtTime(b.endMin, lang)} · {fmtDuration(b.durationMin, lang)}</dd>
        <dt className="text-muted">{t(`staffWord.${shop.industry}`)}</dt><dd className="flex items-center gap-2">{st && <span className="nail" style={{ ['--c' as string]: st.color }} />}{st ? pick(lang, st.name, st.nameZh) : '—'}</dd>
        {!isBlock && <>
          <dt className="text-muted">{t('sv.main')}</dt>
          <dd>{items.map(i => <div key={i.id ?? i.name} className="flex justify-between gap-2"><span>{i.kind === 'addon' ? '+ ' : ''}{pick(lang, i.name, i.nameZh)}</span><span className="tnum text-muted">{money(i.priceCents)}</span></div>)}</dd>
          {est > 0 && <><dt className="text-muted">{t('cal.estPrice')}</dt><dd className="tnum font-semibold">{money(est)}</dd></>}
          <dt className="text-muted">{t('c.phone')}</dt><dd className="tnum">{b.guestPhone ? <a href={`tel:${b.guestPhone}`} className="text-accent">{b.guestPhone}</a> : '—'}</dd>
          <dt className="text-muted">{t('c.email')}</dt><dd className="break-all">{b.guestEmail || '—'}</dd>
          {b.customerId && <><dt className="text-muted">{t('d.customers')}</dt><dd>{t('cal.visits', d.stats.visits, d.stats.noShows)}</dd></>}
          <dt className="text-muted">{t('cal.code')}</dt><dd className="tnum tracking-widest">{b.code}</dd>
          {b.notes && <><dt className="text-muted">{t('cal.customerNote')}</dt><dd className="whitespace-pre-wrap">{b.notes}</dd></>}
          {b.internalNote && <><dt className="text-muted">{t('cal.internalNote')}</dt><dd className="whitespace-pre-wrap">{b.internalNote}</dd></>}
        </>}
        {b.cancelReason && <><dt className="text-muted">{t('bs.cancelled')}</dt><dd>{b.cancelReason}</dd></>}
      </dl>
      {b.design && (
        <div>
          <span className="lbl">{t('nd.forStaff')}</span>
          <div className="flex flex-wrap items-center gap-3"><NailArt design={b.design} size={160} uid="cd" /><span className="text-[13px] text-muted">{describeDesign(b.design, t as (k: string) => string)}</span></div>
        </div>
      )}
      {b.photoUrl && (
        <a href={b.photoUrl} target="_blank" rel="noreferrer" className="block">
          <span className="lbl">{t('cal.refPhoto')}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.photoUrl} alt={t('cal.refPhoto')} className="max-h-56 rounded-xl border border-line object-cover" />
        </a>
      )}

      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          {b.status === 'confirmed' && !isBlock && !b.actualStart && <button className="btn btn-sm btn-dark" disabled={pending} onClick={() => run(() => markStartedAction(shop.id, b.id), undefined, true)}>▶ {t('cal.start')}</button>}
          {b.status === 'confirmed' && !isBlock && <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => setBookingStatusAction(shop.id, b.id, 'completed'))}>{t('cal.markDone')}</button>}
          {b.status === 'confirmed' && !isBlock && <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setBookingStatusAction(shop.id, b.id, 'no_show'))}>{t('cal.markNoShow')}</button>}
          {b.status === 'confirmed' && <button className="btn btn-sm" onClick={() => setMode('move')}>{t('cal.move')}</button>}
          {b.status === 'confirmed' && !isBlock && <button className="btn btn-sm" onClick={() => setMode('items')}>{t('cal.editItems')}</button>}
          {!isBlock && <button className="btn btn-sm" onClick={() => setMode('edit')}>{t('c.edit')}</button>}
          {b.status === 'confirmed' && <button className="btn btn-sm btn-danger" onClick={() => isBlock ? run(() => setBookingStatusAction(shop.id, b.id, 'cancelled')) : setMode('cancel')}>{isBlock ? t('c.delete') : t('cal.cancelBooking')}</button>}
          {b.status !== 'confirmed' && <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setBookingStatusAction(shop.id, b.id, 'confirmed'))}>{t('cal.restore')}</button>}
        </div>
      )}
      {mode === 'move' && <MoveForm shop={shop} b={b} staff={staff} range={range} pending={pending} onCancel={() => setMode('view')}
        onSave={(v) => run(() => moveBookingAction(shop.id, b.id, v))} />}
      {mode === 'items' && <ItemsForm b={b} services={services} pending={pending} onCancel={() => setMode('view')}
        onSave={(s, a, force) => run(() => setItemsAction(shop.id, b.id, s, a, force))} />}
      {mode === 'edit' && <EditForm b={b} pending={pending} onCancel={() => setMode('view')}
        onSave={v => run(() => updateBookingDetailsAction(shop.id, b.id, v))} />}
      {mode === 'cancel' && <CancelForm b={b} pending={pending} onCancel={() => setMode('view')}
        onSave={(reason, notify) => run(() => setBookingStatusAction(shop.id, b.id, 'cancelled', { reason, notify }))} />}
      {err && <p className="err" role="alert">{err}</p>}

      {d.events.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[12.5px] text-muted">
          <span className="eyebrow">{t('cal.history')}</span>
          {d.events.map((e, i) => (
            <span key={i}>
              {new Date(e.at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {' · '}{t(`cal.by.${e.actor}` as DictKey)} · {e.action.startsWith('status:') ? `${t('cal.ev.status')} ${t(`bs.${e.action.slice(7)}` as DictKey)}` : t(`cal.ev.${e.action}` as DictKey)}
            </span>
          ))}
        </div>
      )}
    </Panel>
  )
}

function MoveForm({ shop, b, staff, range, pending, onCancel, onSave }: {
  shop: ShopLite; b: Booking; staff: Staff[]; range: { start: number; end: number }; pending: boolean
  onCancel: () => void; onSave: (v: { date: string; start: number; staffId: string; force: boolean; notify: boolean }) => void
}) {
  const { t, lang } = useI18n()
  const [date, setDate] = useState(b.date)
  const [start, setStart] = useState(b.startMin)
  const [staffId, setStaffId] = useState(b.staffId)
  const [force, setForce] = useState(false)
  const [notify, setNotify] = useState(!!b.guestEmail)
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="lbl" htmlFor="mv-date">{t('c.date')}</label><input id="mv-date" type="date" className="inp" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="lbl" htmlFor="mv-start">{t('c.start')}</label>
          <select id="mv-start" className="inp tnum" value={start} onChange={e => setStart(+e.target.value)}>
            {timeOptions(Math.min(range.start, 360), Math.max(range.end, 1320), 5, lang).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor="mv-staff">{t(`staffWord.${shop.industry}`)}</label>
          <select id="mv-staff" className="inp" value={staffId} onChange={e => setStaffId(e.target.value)}>
            {staff.filter(s => s.active || s.id === b.staffId).map(s => <option key={s.id} value={s.id}>{pick(lang, s.name, s.nameZh)}</option>)}
          </select></div>
      </div>
      <label className="chk text-[13px]"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />{t('cal.force')}</label>
      {b.guestEmail && b.kind !== 'block' && <label className="chk text-[13px]"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />{t('cal.notifyCustomer')}</label>}
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => onSave({ date, start, staffId, force, notify })}>{t('cal.saveMove')}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('c.cancel')}</button>
      </div>
    </div>
  )
}

function ItemsForm({ b, services, pending, onCancel, onSave }: { b: Booking; services: Service[]; pending: boolean; onCancel: () => void; onSave: (s: string[], a: string[], force: boolean) => void }) {
  const { t } = useI18n()
  const [sel, setSel] = useState<string[]>((b.items ?? []).map(i => i.serviceId).filter((x): x is string => !!x))
  const [force, setForce] = useState(false)
  const kindOf = (id: string) => services.find(s => s.id === id)?.kind
  return (
    <div className="card flex flex-col gap-3 p-4">
      <ServiceChecklist services={services} selected={sel} idPrefix="it" onToggle={id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} />
      <label className="chk text-[13px]"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />{t('cal.force')}</label>
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending || !sel.some(id => kindOf(id) === 'service')} onClick={() => onSave(sel.filter(id => kindOf(id) === 'service'), sel.filter(id => kindOf(id) === 'addon'), force)}>{t('c.save')}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('c.cancel')}</button>
      </div>
    </div>
  )
}

function EditForm({ b, pending, onCancel, onSave }: { b: Booking; pending: boolean; onCancel: () => void; onSave: (v: { guestName: string; guestPhone: string; guestEmail: string; notes: string; internalNote: string }) => void }) {
  const { t } = useI18n()
  const [v, setV] = useState({ guestName: b.guestName ?? '', guestPhone: b.guestPhone ?? '', guestEmail: b.guestEmail ?? '', notes: b.notes ?? '', internalNote: b.internalNote ?? '' })
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="lbl" htmlFor="ed-name">{t('c.name')}</label><input id="ed-name" className="inp" value={v.guestName} onChange={f('guestName')} /></div>
        <div><label className="lbl" htmlFor="ed-phone">{t('c.phone')}</label><input id="ed-phone" className="inp" value={v.guestPhone} onChange={f('guestPhone')} /></div>
        <div className="sm:col-span-2"><label className="lbl" htmlFor="ed-email">{t('c.email')}</label><input id="ed-email" className="inp" value={v.guestEmail} onChange={f('guestEmail')} /></div>
        <div className="sm:col-span-2"><label className="lbl" htmlFor="ed-notes">{t('cal.customerNote')}</label><textarea id="ed-notes" className="inp" value={v.notes} onChange={f('notes')} /></div>
        <div className="sm:col-span-2"><label className="lbl" htmlFor="ed-int">{t('cal.internalNote')}</label><textarea id="ed-int" className="inp" value={v.internalNote} onChange={f('internalNote')} /></div>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => onSave(v)}>{t('c.save')}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('c.cancel')}</button>
      </div>
    </div>
  )
}

function CancelForm({ b, pending, onCancel, onSave }: { b: Booking; pending: boolean; onCancel: () => void; onSave: (reason: string, notify: boolean) => void }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(!!b.guestEmail)
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div><label className="lbl" htmlFor="cx-reason">{t('cal.cancelReason')}</label><textarea id="cx-reason" className="inp" value={reason} onChange={e => setReason(e.target.value)} /></div>
      {b.guestEmail && <label className="chk text-[13px]"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />{t('cal.notifyCustomer')}</label>}
      <div className="flex gap-2">
        <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => onSave(reason, notify)}>{t('cal.confirmCancel')}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('c.back')}</button>
      </div>
    </div>
  )
}
