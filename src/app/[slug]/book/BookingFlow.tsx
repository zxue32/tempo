'use client'
import Link from 'next/link'
import { shopHasHairTools, shopHasNailTools } from '@/lib/industries/shop'
import type { IndustryKey } from '@/lib/industries/registry'
import type { CurrencyCode } from '@/lib/markets'
import { formatMoney } from '@/lib/money'
import { missingRequired, settle, type FormSchema } from '@/lib/forms'
import { IntakeQuestions } from './IntakeQuestions'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { pick, type DictKey } from '@/lib/i18n'
import { addDays, diffDays, fmtDate, fmtTime, fmtDuration, weekday } from '@/lib/tz'
import type { Industry, Skill } from '@/lib/types'
import { downscale } from '@/components/downscale'
import { track, visitId } from '@/components/track'
import type { NailDesign } from '@/lib/types'
import { NailArt, describeDesign, isNailDesign } from '@/components/NailArt'
import { designToPng, type SwatchOption } from '@/components/NailDesigner'
import { readHandoff, clearHandoff, noteFromSummary } from '@/lib/lune'

export type FlowShop = {
  slug: string; industry: Industry; industries: IndustryKey[]; currency: CurrencyCode; maxGuests: number; allowAnyStaff: boolean; maxDays: number; leadMinutes: number
  cutoffMinutes: number; showPrices: boolean; live: boolean; note: string | null; phone: string | null; waitlist: boolean
}
export type FlowInitial = { services: string[]; addons: string[]; staff: string | null; date: string | null; look: { id: string; url: string } | null; design: NailDesign | null; hairColor: { id: string; label: string; hex: string } | null }
type Svc = { id: string; kind: 'service' | 'addon'; category: string; industry: string; appliesTo: string[]; name: string; nameZh: string | null; descEn: string | null; descZh: string | null; durationMin: number; priceCents: number | null; priceFrom: boolean; questionEn: string | null; questionZh: string | null }
type Person = { id: string; name: string; nameZh: string | null; bioEn: string | null; bioZh: string | null; color: string; photoUrl: string | null }
type Guest = { serviceIds: string[]; addonIds: string[]; staffId: string | null; answers?: Record<string, boolean>; intake?: Record<string, unknown> }
/** the shop's active intake form for an industry (CORE-05) */
export type FlowForm = { id: string; industry: string; schema: FormSchema }
type DaySum = { date: string; closed: boolean; count: number }
type SlotRes = { start: number; staff: string[]; minutes: number[] }

const money = (minor: number, currency: CurrencyCode) => formatMoney(minor, currency)
const WINDOW = 14

const hasQuestion = (s: Svc) => !!(s.questionEn || s.questionZh)

export function BookingFlow({ shop, today, services, staff, skills, initial, emailOn = false, swatches = [], forms = [] }: {
  shop: FlowShop; today: string; services: Svc[]; staff: Person[]; skills: Skill[]; initial: FlowInitial; emailOn?: boolean; swatches?: SwatchOption[]; forms?: FlowForm[]
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const word = t(`staffWord.${shop.industry}`)
  const byId = useMemo(() => new Map(services.map(s => [s.id, s])), [services])
  const skillMap = useMemo(() => {
    const m = new Map<string, Map<string, number | null>>()
    for (const k of skills) { if (!m.has(k.staffId)) m.set(k.staffId, new Map()); m.get(k.staffId)!.set(k.serviceId, k.durationMin) }
    return m
  }, [skills])

  const [guests, setGuests] = useState<Guest[]>(() => {
    const svc = initial.services.filter(id => byId.get(id)?.kind === 'service')
    const cats = new Set(svc.map(id => byId.get(id)!.category))
    const fits = (a: Svc) => !a.appliesTo.length || a.appliesTo.some(c => cats.has(c))
    const add = initial.addons.map(id => byId.get(id)).filter((a): a is Svc => !!a && a.kind === 'addon' && fits(a))
    const answers: Record<string, boolean> = {}
    for (const a of add) if (hasQuestion(a)) answers[a.id] = true
    const skilled = (id: string) => svc.every(x => skillMap.get(id)?.has(x))
    const st = initial.staff && staff.some(s => s.id === initial.staff) && skilled(initial.staff) ? initial.staff : (shop.allowAnyStaff ? null : staff[0]?.id ?? null)
    return [{ serviceIds: svc, addonIds: add.map(a => a.id), staffId: st, answers }]
  })
  const [g, setG] = useState(0)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const startDate = initial.date && initial.date >= today ? initial.date : null
  const [windowStart, setWindowStart] = useState(startDate ?? today)
  const [date, setDate] = useState<string | null>(startDate)
  const [lookId, setLookId] = useState<string | null>(initial.look?.id ?? null)
  const [days, setDays] = useState<DaySum[]>([])
  const [slots, setSlots] = useState<SlotRes[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [slot, setSlot] = useState<SlotRes | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', agree: false, marketing: false, website: '' })
  const [photo, setPhoto] = useState<string | null>(initial.look?.url ?? null)
  // what the customer sees: their own copy, because an uploaded reference photo is private to the shop (CORE-04)
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial.look?.url ?? null)
  const [design, setDesign] = useState<NailDesign | null>(initial.design)
  const [hairColor, setHairColor] = useState(initial.hairColor)
  // what this phone booked with last time (kept only on the device), offered as a one-tap repeat
  const [last, setLast] = useState<{ design: NailDesign | null; hairColor: { id: string; label: string; hex: string } | null }>({ design: null, hairColor: null })
  const designRef = useRef<HTMLDivElement>(null)
  // a design brought over from the 3D studio: its card picture and the technician's note
  const [lune, setLune] = useState<{ name: string; summary: string; card: Blob | null; cardUrl: string | null } | null>(null)
  const studioHref = `/${shop.slug}/design${guests[0]?.serviceIds[0] ? `?service=${guests[0].serviceIds[0]}` : ''}`
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('from')) return
    const h = readHandoff(shop.slug)
    if (!h) return
    const cardUrl = h.card ? URL.createObjectURL(h.card) : null
    setDesign(h.design)
    setLune({ name: h.name, summary: h.summary, card: h.card, cardUrl })
    return () => { if (cardUrl) URL.revokeObjectURL(cardUrl) }
  }, [shop.slug])
  const dropDesign = () => { setDesign(null); setLune(null); clearHandoff() }
  const canDesign = shopHasNailTools(shop)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tempo.contact') || 'null')
      if (saved && typeof saved === 'object') setForm(f => ({ ...f, name: saved.name || '', phone: saved.phone || '', email: saved.email || '' }))
      const prev = JSON.parse(localStorage.getItem('tempo.last') || 'null')
      if (prev && typeof prev === 'object' && prev.shop === shop.slug) {
        const hc = prev.hairColor
        setLast({
          design: isNailDesign(prev.design) ? prev.design : null,
          hairColor: hc && typeof hc === 'object' && typeof hc.id === 'string' && typeof hc.label === 'string' && /^#[0-9a-fA-F]{6}$/.test(String(hc.hex)) ? { id: hc.id, label: String(hc.label).slice(0, 80), hex: hc.hex } : null,
        })
      }
    } catch { /* storage unavailable */ }
  }, [shop.slug])

  const guest = guests[g]
  const mainOf = (gs: Guest) => gs.serviceIds.map(id => byId.get(id)!).filter(Boolean)
  const catsOf = (gs: Guest) => new Set(mainOf(gs).map(s => s.category))
  const qualified = (gs: Guest) => staff.filter(p => gs.serviceIds.length > 0 && gs.serviceIds.every(id => skillMap.get(p.id)?.has(id)))
  const durationFor = (gs: Guest, staffId: string | null) => {
    let m = 0
    for (const id of gs.serviceIds) m += (staffId ? skillMap.get(staffId)?.get(id) : null) ?? byId.get(id)?.durationMin ?? 0
    for (const id of gs.addonIds) m += byId.get(id)?.durationMin ?? 0
    return m
  }
  const priceOf = (gs: Guest) => [...gs.serviceIds, ...gs.addonIds].reduce((s, id) => s + (byId.get(id)?.priceCents ?? 0), 0)
  const anyFrom = guests.some(gs => [...gs.serviceIds, ...gs.addonIds].some(id => byId.get(id)?.priceFrom))
  const total = guests.reduce((s, gs) => s + priceOf(gs), 0)
  // the intake form that applies to what this guest picked, if the shop has one switched on
  const formFor = (gs: Guest) => { const ind = byId.get(gs.serviceIds[0] ?? '')?.industry; return ind ? forms.find(f => f.industry === ind) ?? null : null }
  const questionsFor = (gs: Guest) => {
    const cats = catsOf(gs)
    // an add-on the shop's intake form already asks about isn't asked twice
    const f = formFor(gs)
    const asked = f ? settle(f.schema, {}).linked : new Set<string>()
    return services.filter(s => s.kind === 'addon' && hasQuestion(s) && !asked.has(s.id) && (!s.appliesTo.length || s.appliesTo.some(c => cats.has(c))))
  }
  const onIntake = (answers: Record<string, unknown>) => {
    const form = formFor(guest)
    if (!form) return
    // answers that call for an add-on bring it in; changing the answer takes it out again
    const { addons, linked } = settle(form.schema, answers)
    const addonIds = [...guest.addonIds.filter(id => !linked.has(id) || addons.has(id)), ...[...addons].filter(id => !guest.addonIds.includes(id) && byId.has(id))]
    update(g, { intake: answers, addonIds })
    resetTime()
  }
  const ready1 = guests.every(gs => gs.serviceIds.length > 0 && questionsFor(gs).every(q => gs.answers?.[q.id] !== undefined)
    && (() => { const f = formFor(gs); return !f || missingRequired(f.schema, gs.intake ?? {}).length === 0 })())
  const answer = (id: string, yes: boolean) => {
    update(g, { answers: { ...(guest.answers ?? {}), [id]: yes }, addonIds: yes ? Array.from(new Set([...guest.addonIds, id])) : guest.addonIds.filter(x => x !== id) })
    resetTime()
  }
  const longest = Math.max(0, ...guests.map((gs, i) => slot ? slot.minutes[i] ?? durationFor(gs, gs.staffId) : durationFor(gs, gs.staffId)))

  const update = (i: number, patch: Partial<Guest>) => setGuests(list => list.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const resetTime = () => { setSlot(null); setNotice(null) }

  const toggleService = (id: string) => {
    const s = byId.get(id)!
    if (s.kind === 'service') {
      const serviceIds = guest.serviceIds.includes(id) ? guest.serviceIds.filter(x => x !== id) : [...guest.serviceIds, id]
      const cats = new Set(serviceIds.map(x => byId.get(x)!.category))
      const addonIds = guest.addonIds.filter(a => { const ad = byId.get(a)!; return !ad.appliesTo.length || ad.appliesTo.some(c => cats.has(c)) })
      let staffId = guest.staffId
      if (staffId && !serviceIds.every(x => skillMap.get(staffId!)?.has(x))) staffId = null
      if (!staffId && !shop.allowAnyStaff) staffId = qualified({ serviceIds, addonIds, staffId: null })[0]?.id ?? null
      update(g, { serviceIds, addonIds, staffId })
    } else {
      update(g, { addonIds: guest.addonIds.includes(id) ? guest.addonIds.filter(x => x !== id) : [...guest.addonIds, id] })
    }
    resetTime()
  }

  // ------------------------------------------------ availability
  const reqKey = JSON.stringify(guests)
  // Only the latest request may update state; a slow earlier response must not override a newer choice.
  const reqSeq = useRef(0)
  const load = useCallback(async (from: string, d: string | null) => {
    const seq = ++reqSeq.current
    setLoading(true)
    try {
      const res = await fetch(`/api/public/${shop.slug}/availability`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests, from, days: WINDOW, date: d }),
      })
      const data = await res.json()
      if (seq !== reqSeq.current) return
      if (!res.ok) { setDays([]); setSlots([]); setNotice(t('c.error')); return }
      setDays(data.days)
      setSlots(data.slots)
      setNext(data.next)
      if (!d) {
        const first = (data.days as DaySum[]).find(x => x.count > 0)
        if (first) setDate(first.date)
        else setDate(from)
      }
    } catch {
      if (seq === reqSeq.current) setNotice(t('c.error'))
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [reqKey, shop.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 2 || !ready1) return
    load(windowStart, date)
  }, [step, windowStart, date, load, ready1])

  useEffect(() => { if (step === 2) setSlot(s => (s && slots.some(x => x.start === s.start) ? slots.find(x => x.start === s.start)! : null)) }, [slots, step])

  useEffect(() => { track(shop.slug, 'start') }, [shop.slug])
  useEffect(() => { if (step === 2) track(shop.slug, 'time'); if (step === 3) track(shop.slug, 'details') }, [step, shop.slug])

  const goStep = (s: 1 | 2 | 3) => {
    if (s === 2 && !shop.allowAnyStaff) {
      setGuests(list => list.map((x, i) => x.staffId ? x : { ...x, staffId: qualified(x).find(p => !list.some((o, j) => j !== i && o.staffId === p.id))?.id ?? null }))
    }
    setStep(s)
    setErr(null)
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ------------------------------------------------ photo
  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setErr(null)
    try {
      const blob = await downscale(file)
      const fd = new FormData()
      fd.append('file', blob, 'photo.jpg')
      const res = await fetch(`/api/public/${shop.slug}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPhoto(data.url)
      setPhotoPreview(URL.createObjectURL(blob))
      setLookId(null)
    } catch {
      setErr(t('bf.photoErr'))
    } finally {
      setUploading(false)
    }
  }

  // ------------------------------------------------ submit
  const submit = async () => {
    setErr(null)
    if (!form.name.trim()) return setErr(t('bf.err.name'))
    if (form.phone.replace(/\D/g, '').length < 10) return setErr(t('bf.err.phone'))
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim())) return setErr(t('bf.err.email'))
    if (!form.agree) return setErr(t('bf.err.agree'))
    if (!slot || !date) return goStep(2)
    setSubmitting(true)
    try {
      let photoUrl = lookId ? null : photo
      if (design && !photoUrl) {
        // the 3D studio's design card, or else a picture of the design, so the technician sees it like any reference photo
        const svg = designRef.current?.querySelector('svg')
        if (lune?.card || svg) {
          try {
            const png = lune?.card ?? await designToPng(svg!)
            const fd = new FormData(); fd.append('file', png, 'design.png')
            const up = await fetch(`/api/public/${shop.slug}/upload`, { method: 'POST', body: fd })
            const upData = await up.json().catch(() => ({}))
            if (up.ok && upData.url) photoUrl = upData.url
          } catch { /* the design still travels as data */ }
        }
      }
      const res = await fetch(`/api/public/${shop.slug}/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guests: guests.map(gs => {
            const f = formFor(gs)
            return { serviceIds: gs.serviceIds, addonIds: gs.addonIds, staffId: gs.staffId, intake: f ? { formId: f.id, answers: settle(f.schema, gs.intake ?? {}).answers } : null }
          }), date, start: slot.start,
          name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
          notes: [form.notes.trim(), lune ? `${t('lu.from3d')}「${lune.name}」: ${noteFromSummary(lune.summary)}` : design ? `${t('nd.yourDesign')}: ${describeDesign(design, t as (k: string) => string)}` : '', hairColor ? `${t('hc.chosen')}: ${hairColor.label}` : ''].filter(Boolean).join('\n').slice(0, 1000),
          photoUrl, lookId: photoUrl ? null : lookId, lang, website: form.website, session: visitId(), design, marketing: form.marketing,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.token) {
        try {
          localStorage.setItem('tempo.contact', JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }))
          if (design || hairColor) localStorage.setItem('tempo.last', JSON.stringify({ shop: shop.slug, design, hairColor }))
          clearHandoff()
        } catch { /* ignore */ }
        router.push(`/b/${data.token}?new=1`)
        return
      }
      const code = data.error as string
      if (code === 'intake') {
        const [why, arg] = String(data.detail ?? '').split(':')
        if (why === 'form_changed') { setErr(t('in.formChanged')); router.refresh(); goStep(1); return }
        if (why === 'addon_missing' && arg && byId.has(arg)) {
          const a = byId.get(arg)!
          setGuests(list => list.map(x => (x.addonIds.includes(arg) || !formFor(x) ? x : { ...x, addonIds: [...x.addonIds, arg] })))
          setSlot(null); goStep(2); setNotice(t('in.addonMissing', pick(lang, a.name, a.nameZh))); return
        }
        const field = forms.flatMap(f => f.schema.fields).find(f => f.key === arg)
        setErr(why === 'required' && field ? t('in.required', field.label[lang]) : t('in.invalid'))
        goStep(1)
        return
      }
      if (code === 'taken') { setNotice(t('bf.slotGone')); setSlot(null); goStep(2); load(windowStart, date); return }
      const msg: Record<string, string> = {
        limit: t('bf.err.limit'), blocked: t('bf.err.blocked'), not_open: t('bf.err.not_open'), service_gone: t('bf.err.service_gone'), capability_disabled: t('bf.err.capability_disabled'), market_unsupported: t('bf.err.market_unsupported'),
        dst_gap: t('bf.err.dst_gap'), dst_ambiguous: t('bf.err.dst_ambiguous'),
        blocked_noshow: t('bf.err.noshow', shop.phone || ''),
        rate: t('bf.err.rate'), too_soon: t('bf.err.too_soon', fmtDuration(shop.leadMinutes, lang)), too_far: t('bf.err.too_far', shop.maxDays),
      }
      setErr(msg[code === 'blocked' && data.detail === 'noshow' ? 'blocked_noshow' : code === 'invalid' && /^dst_/.test(data.detail ?? '') ? data.detail : code] || (data.detail === 'phone' ? t('bf.err.phone') : data.detail === 'email' ? t('bf.err.email') : t('bf.err.invalid')))
    } catch {
      setErr(t('c.error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ------------------------------------------------ render helpers
  const grouped = useMemo(() => {
    const out: Array<[DictKey, SlotRes[]]> = [['c.morning', []], ['c.afternoon', []], ['c.evening', []]]
    for (const s of slots) out[s.start < 720 ? 0 : s.start < 1020 ? 1 : 2][1].push(s)
    return out.filter(([, l]) => l.length)
  }, [slots])
  const staffName = (id: string) => { const p = staff.find(s => s.id === id); return p ? pick(lang, p.name, p.nameZh) : '' }
  const wd = t('c.weekdays').split(',')
  const lastDay = addDays(today, shop.maxDays)
  const stripDays = Array.from({ length: WINDOW }, (_, i) => addDays(windowStart, i)).filter(d => d <= lastDay)

  const summary = (
    <aside className="s-card flex flex-col gap-3 p-4" aria-label={t('bf.summary')}>
      <b>{t('bf.summary')}</b>
      {guests.map((gs, i) => (
        <div key={i} className="flex flex-col gap-1 text-[14px]">
          {guests.length > 1 && <span className="text-[11.5px] font-bold uppercase tracking-[.12em] s-muted">{t('bf.guest', i + 1)}</span>}
          {gs.serviceIds.length === 0 ? <span className="s-muted">{t('bf.nothing')}</span> : [...gs.serviceIds, ...gs.addonIds].map(id => {
            const s = byId.get(id)!
            return <div key={id} className="flex justify-between gap-3"><span>{s.kind === 'addon' ? '+ ' : ''}{pick(lang, s.name, s.nameZh)}</span>{shop.showPrices && s.priceCents != null && <span className="tnum">{money(s.priceCents, shop.currency)}</span>}</div>
          })}
          {gs.serviceIds.length > 0 && (
            <div className="flex justify-between gap-3 text-[13px] s-muted">
              <span>{slot ? staffName(slot.staff[i]) : gs.staffId ? staffName(gs.staffId) : t('bf.any', word)}</span>
              <span className="tnum">{fmtDuration(slot ? slot.minutes[i] : durationFor(gs, gs.staffId), lang)}</span>
            </div>
          )}
        </div>
      ))}
      {hairColor && (
        <div className="flex items-center gap-3 border-t pt-2 text-[13px] s-line">
          <span className="h-9 w-9 flex-none rounded-full border border-black/10" style={{ background: hairColor.hex }} />
          <span className="min-w-0 flex-1"><b className="block">{t('hc.chosen')}</b><span className="s-muted">{hairColor.label}</span></span>
          <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={() => setHairColor(null)}>×</button>
        </div>
      )}
      {design && (
        <div className="flex items-center gap-3 border-t pt-2 text-[13px] s-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {lune?.cardUrl ? <img src={lune.cardUrl} alt={t('lu.cardAlt')} className="h-[84px] w-[84px] flex-none rounded-lg object-cover" /> : <NailArt design={design} size={84} uid="sum" />}
          <span className="min-w-0"><b className="block">{t('nd.yourDesign')}</b><span className="s-muted">{lune ? lune.name : describeDesign(design, t as (k: string) => string)}</span></span>
        </div>
      )}
      {date && slot && (
        <div className="flex justify-between gap-3 border-t pt-2 text-[14px] s-line">
          <span className="s-muted">{t('bf.when')}</span>
          <b className="tnum text-right">{fmtDate(date, lang)} · {fmtTime(slot.start, lang)}–{fmtTime(slot.start + longest, lang)}</b>
        </div>
      )}
      {shop.showPrices && total > 0 && (
        <div className="flex justify-between gap-3 border-t pt-2 s-line">
          <span>{t('bf.estTotal')}</span><b className="tnum">{anyFrom ? t('c.priceFrom', money(total, shop.currency)) : money(total, shop.currency)}</b>
        </div>
      )}
      <span className="text-[12.5px] s-muted">{t('bf.payInStore')}</span>
    </aside>
  )

  return (
    <div ref={topRef} className="mx-auto max-w-5xl scroll-mt-4 px-4 pb-32">
      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Steps">
        {([1, 2, 3] as const).map(n => (
          <li key={n}>
            <button type="button" disabled={n > step} onClick={() => n < step && goStep(n)} aria-current={step === n ? 'step' : undefined}
              className={`flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[13px] font-semibold ${step === n ? 'border' : ''}`} style={{ borderColor: 'var(--s-ink)', color: n > step ? 'var(--s-muted)' : 'var(--s-ink)' }}>
              <span className="grid h-6 w-6 place-items-center rounded-full text-[11.5px]" style={{ background: step === n ? 'var(--s-ink)' : 'var(--s-sunk)', color: step === n ? 'var(--s-bg)' : 'inherit' }}>{n < step ? '✓' : n}</span>
              {t(`bf.step${n}` as DictKey)}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="s-display text-[30px]">{t('bf.chooseServices')}</h1>
                {shop.maxGuests > 1 && guests.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {guests.map((gs, i) => (
                      <span key={i} className="inline-flex items-center overflow-hidden rounded-full border s-line" style={i === g ? { borderColor: 'var(--s-ink)', boxShadow: 'inset 0 0 0 1px var(--s-ink)' } : {}}>
                        <button type="button" className="h-9 px-3.5 text-[13px] font-semibold" onClick={() => setG(i)} aria-pressed={i === g}>
                          {t('bf.guest', i + 1)}{gs.serviceIds.length ? ` · ${gs.serviceIds.length + gs.addonIds.length}` : ''}
                        </button>
                        {guests.length > 1 && <button type="button" className="h-9 pr-3 text-[16px] s-muted" aria-label={t('bf.removeGuest')} onClick={() => { setGuests(l => l.filter((_, j) => j !== i)); setG(x => Math.max(0, Math.min(x, guests.length - 2))); resetTime() }}>×</button>}
                      </span>
                    ))}
                    {guests.length < shop.maxGuests && (
                      <button type="button" className="h-9 px-2 text-[13px] font-bold" style={{ color: 'var(--s-accent)' }}
                        onClick={() => { setGuests(l => [...l, { serviceIds: [], addonIds: [], staffId: shop.allowAnyStaff ? null : staff[0]?.id ?? null }]); setG(guests.length); resetTime() }}>
                        {t('bf.addGuest')}
                      </button>
                    )}
                  </div>
                )}
                {guests.length > 1 && <p className="text-[13.5px] s-muted">{t('bf.groupHint', word)} <b style={{ color: 'var(--s-ink)' }}>{t('bf.choosingFor', g + 1)}</b></p>}
              </div>
              {Array.from(new Set(services.filter(s => s.kind === 'service').map(s => s.category))).map(c => (
                <section key={c} className="flex flex-col gap-2">
                  <h2 className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t(`cat.${c}` as DictKey)}</h2>
                  {services.filter(s => s.kind === 'service' && s.category === c).map(s => {
                    const on = guest.serviceIds.includes(s.id)
                    const offered = staff.some(p => skillMap.get(p.id)?.has(s.id))
                    return (
                      <button key={s.id} type="button" className="s-opt" aria-pressed={on} disabled={!offered} onClick={() => toggleService(s.id)}>
                        <span className="s-tick">✓</span>
                        <span className="min-w-0 flex-1">
                          <b className="block">{pick(lang, s.name, s.nameZh)}</b>
                          <span className="block text-[13px] s-muted">{fmtDuration(s.durationMin, lang)}{pick(lang, s.descEn, s.descZh) ? <Desc text={pick(lang, s.descEn, s.descZh)} open={on} /> : null}</span>
                        </span>
                        {shop.showPrices && s.priceCents != null && <b className="tnum">{s.priceFrom ? t('c.priceFrom', money(s.priceCents, shop.currency)) : money(s.priceCents, shop.currency)}</b>}
                      </button>
                    )
                  })}
                </section>
              ))}
              {guest.serviceIds.length > 0 && questionsFor(guest).length > 0 && (
                <section className="flex flex-col gap-2" aria-labelledby="q-h">
                  <h2 id="q-h" className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t('bf.questions')}</h2>
                  {questionsFor(guest).map(q => {
                    const a = guest.answers?.[q.id]
                    return (
                      <div key={q.id} className="s-card flex flex-wrap items-center gap-3 p-3" role="group" aria-label={pick(lang, q.questionEn, q.questionZh)}>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[14.5px]">{pick(lang, q.questionEn, q.questionZh)}</b>
                          <span className="text-[12.5px] s-muted">{t('bf.questionYes', pick(lang, q.name, q.nameZh), fmtDuration(q.durationMin, lang))}{shop.showPrices && q.priceCents ? ` · +${money(q.priceCents, shop.currency)}` : ''}</span>
                        </span>
                        <span className="flex gap-2">
                          <button type="button" className="s-pill !px-4" aria-pressed={a === true} onClick={() => answer(q.id, true)}>{t('c.yes')}</button>
                          <button type="button" className="s-pill !px-4" aria-pressed={a === false} onClick={() => answer(q.id, false)}>{t('c.no')}</button>
                        </span>
                      </div>
                    )
                  })}
                </section>
              )}
              {guest.serviceIds.length > 0 && formFor(guest) && (
                <IntakeQuestions slug={shop.slug} form={formFor(guest)!.schema} answers={guest.intake ?? {}} onChange={onIntake}
                  addons={services.filter(s => s.kind === 'addon')} showPrices={shop.showPrices} currency={shop.currency} />
              )}
              {(() => {
                const cats = catsOf(guest)
                const list = services.filter(s => s.kind === 'addon' && !hasQuestion(s) && (!s.appliesTo.length || s.appliesTo.some(c => cats.has(c))))
                if (guest.serviceIds.length && !list.length) return null
                return (
                  <section className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t('bf.addons')}</h2>
                      <span className="text-[12.5px] s-muted">{t('bf.addonsHint')}</span>
                    </div>
                    {!guest.serviceIds.length ? <p className="text-[14px] s-muted">{t('bf.pickServiceFirst')}</p> : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {list.map(s => (
                          <button key={s.id} type="button" className="s-opt !py-2.5" aria-pressed={guest.addonIds.includes(s.id)} onClick={() => toggleService(s.id)}>
                            <span className="s-tick">✓</span>
                            <span className="min-w-0 flex-1"><b className="block text-[14px]">{pick(lang, s.name, s.nameZh)}</b><span className="text-[12.5px] s-muted">+{fmtDuration(s.durationMin, lang)}</span></span>
                            {shop.showPrices && s.priceCents != null && <b className="tnum text-[14px]">+{money(s.priceCents, shop.currency)}</b>}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })()}
              {shop.maxGuests > 1 && guests.length === 1 && guest.serviceIds.length > 0 && (
                <button type="button" className="self-start text-[13.5px] font-semibold" style={{ color: 'var(--s-accent)' }}
                  onClick={() => { setGuests(l => [...l, { serviceIds: [], addonIds: [], staffId: shop.allowAnyStaff ? null : staff[0]?.id ?? null }]); setG(1); resetTime() }}>
                  {t('bf.addGuest')}
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <h1 className="s-display text-[30px]">{t('bf.pickTime')}</h1>
              {guests.map((gs, i) => {
                const q = qualified(gs)
                return (
                  <section key={i} className="flex flex-col gap-2">
                    <h2 className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{guests.length > 1 ? `${t('bf.guest', i + 1)} · ` : ''}{t('bf.who', word)}</h2>
                    <div className="flex gap-3 overflow-x-auto pb-1" role="radiogroup" aria-label={t('bf.who', word)}>
                      {shop.allowAnyStaff && (
                        <PersonChip on={gs.staffId === null} label={t('bf.any', word)} sub={t('bf.anySub')} color="var(--s-ink)" letter="★" onClick={() => { update(i, { staffId: null }); resetTime() }} />
                      )}
                      {q.map(p => (
                        <PersonChip key={p.id} on={gs.staffId === p.id} label={pick(lang, p.name, p.nameZh)} sub={fmtDuration(durationFor(gs, p.id), lang)} color={p.color} photo={p.photoUrl}
                          letter={pick(lang, p.name, p.nameZh).charAt(0).toUpperCase()}
                          disabled={guests.some((o, j) => j !== i && o.staffId === p.id)}
                          onClick={() => { update(i, { staffId: p.id }); resetTime() }} />
                      ))}
                    </div>
                  </section>
                )
              })}

              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="s-btn s-btn-ghost s-btn-sm" aria-label="Earlier" disabled={windowStart <= today}
                    onClick={() => { const w = addDays(windowStart, -WINDOW); setWindowStart(diffDays(w, today) < 0 ? today : w); setDate(null); resetTime() }}>‹</button>
                  <button type="button" className="s-btn s-btn-ghost s-btn-sm" aria-label="Later" disabled={addDays(windowStart, WINDOW) > lastDay}
                    onClick={() => { setWindowStart(addDays(windowStart, WINDOW)); setDate(null); resetTime() }}>›</button>
                  <label className="ml-auto flex items-center gap-2 text-[13px] s-muted">{t('bf.moreDates')}
                    <input type="date" className="s-inp !h-10 !w-auto" min={today} max={lastDay} value={date ?? ''}
                      onChange={e => { const v = e.target.value; if (!v) return; setWindowStart(v); setDate(v); resetTime() }} />
                  </label>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={t('c.date')}>
                  {stripDays.map(d => {
                    const s = days.find(x => x.date === d)
                    const on = d === date
                    const label = s ? (s.closed ? t('c.closed') : s.count ? t('bf.slotsN', s.count) : t('bf.full')) : ''
                    return (
                      <button key={d} type="button" role="radio" aria-checked={on} onClick={() => { setDate(d); resetTime() }}
                        className="flex w-[64px] flex-none flex-col items-center rounded-xl border py-2" style={on ? { background: 'var(--s-ink)', color: 'var(--s-bg)', borderColor: 'var(--s-ink)' } : { borderColor: 'var(--s-line)', background: 'var(--s-surface)', opacity: s && !s.count ? 0.55 : 1 }}>
                        <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">{d === today ? t('c.today') : wd[weekday(d)]}</span>
                        <span className="s-display text-[22px] leading-tight">{+d.slice(8)}</span>
                        <span className="h-4 text-[11px] opacity-80">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              {notice && <p className="rounded-xl px-3 py-2 text-[14px] font-semibold" style={{ background: 'var(--s-soft)' }} role="alert">{notice}</p>}
              <p className="text-[13px] s-muted">{t('bf.fitsHint', fmtDuration(longest || durationFor(guest, guest.staffId), lang))}</p>

              <section aria-live="polite" aria-busy={loading} className="flex flex-col gap-4">
                {loading && !slots.length ? <p className="s-muted">{t('c.loading')}</p> : grouped.length ? grouped.map(([k, list]) => (
                  <div key={k} className="flex flex-col gap-2">
                    <span className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t(k)}</span>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {list.map(s => <button key={s.start} type="button" className="s-pill" aria-pressed={slot?.start === s.start} onClick={() => { setSlot(s); setNotice(null) }}>{fmtTime(s.start, lang)}</button>)}
                    </div>
                  </div>
                )) : date && (
                  <div className="s-card flex flex-col items-start gap-3 p-5">
                    <p>{t('bf.noSlots', fmtDuration(longest || durationFor(guest, guest.staffId), lang))}</p>
                    {next ? <button type="button" className="s-btn s-btn-sm" onClick={() => { setWindowStart(next); setDate(next); resetTime() }}>{t('bf.nextAvailable', fmtDate(next, lang))}</button>
                      : <p className="text-[14px] s-muted">{t('bf.noneSoon', shop.maxDays)}{shop.phone ? ` · ${shop.phone}` : ''}</p>}
                  </div>
                )}
                {shop.waitlist && date && !loading && guests.length === 1 && (
                  <Waitlist slug={shop.slug} date={date} guest={guests[0]} contact={form} onContact={c => setForm(f => ({ ...f, ...c }))} prominent={!slots.length} />
                )}
              </section>
            </div>
          )}

          {step === 3 && (
            <form className="flex flex-col gap-4" noValidate onSubmit={e => { e.preventDefault(); submit() }}>
              <h1 className="s-display text-[30px]">{t('bf.details')}</h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="s-lbl" htmlFor="bf-name">{t('c.name')} *</label>
                  <input id="bf-name" className="s-inp" autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} />
                </div>
                <div>
                  <label className="s-lbl" htmlFor="bf-phone">{t('c.phone')} *</label>
                  <input id="bf-phone" className="s-inp tnum" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 555-0123" maxLength={30} />
                  <p className="mt-1 text-[12px] s-muted">{t('bf.phoneHint')}</p>
                </div>
                <div>
                  <label className="s-lbl" htmlFor="bf-email">{t('c.email')} *</label>
                  <input id="bf-email" className="s-inp" type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={120} />
                  {emailOn && <p className="mt-1 text-[12px] s-muted">{t('bf.emailHint')}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="s-lbl" htmlFor="bf-notes">{t('c.notes')} ({t('c.optional')})</label>
                  <textarea id="bf-notes" className="s-inp" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={t('bf.notesPh')} maxLength={1000} />
                </div>
              </div>
              {hairColor && (
                <div className="s-card flex items-center gap-3 p-3">
                  <span className="h-10 w-10 flex-none rounded-full border border-black/10" style={{ background: hairColor.hex }} />
                  <span className="min-w-0 flex-1"><b className="block text-[14px]">{t('hc.chosen')}</b><span className="text-[13px] s-muted">{hairColor.label}</span></span>
                  <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={() => setHairColor(null)}>{t('bf.photoRemove')}</button>
                </div>
              )}
              {!hairColor && last.hairColor && shopHasHairTools(shop) && (
                <div className="s-card flex items-center gap-3 p-3">
                  <span className="h-10 w-10 flex-none rounded-full border border-black/10" style={{ background: last.hairColor.hex }} />
                  <span className="min-w-0 flex-1"><b className="block text-[14px]">{t('pc.lastHair')}</b><span className="text-[13px] s-muted">{last.hairColor.label}</span></span>
                  <button type="button" className="s-btn s-btn-sm" onClick={() => setHairColor(last.hairColor)}>{t('pc.useLast')}</button>
                </div>
              )}
              {canDesign && (
                <div className="s-card flex flex-col gap-3 p-4" ref={designRef}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>{t('nd.title')}</b>
                    {design && <span className="text-[12.5px] s-muted">{t('nd.attached')}</span>}
                  </div>
                  {design ? (
                    <div className="flex flex-wrap items-start gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {lune?.cardUrl ? <img src={lune.cardUrl} alt={t('lu.cardAlt')} className="w-[180px] max-w-full flex-none rounded-xl object-cover" /> : <NailArt design={design} size={150} uid="bf" />}
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {lune ? (
                          <>
                            <b className="text-[14px]">{t('lu.from3d')} · {lune.name}</b>
                            <span className="whitespace-pre-line text-[13px] s-muted">{lune.summary}</span>
                          </>
                        ) : <span className="text-[13.5px]">{describeDesign(design, t as (k: string) => string)}</span>}
                        <div className="flex flex-wrap gap-2">
                          <Link href={studioHref} className="s-btn s-btn-ghost s-btn-sm">{t('nd.change')}</Link>
                          <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={dropDesign}>{t('nd.remove')}</button>
                        </div>
                      </div>
                    </div>
                  ) : last.design ? (
                    <div className="flex flex-wrap items-center gap-4">
                      <NailArt design={last.design} size={120} uid="bfl" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="text-[13.5px]"><b>{t('pc.lastDesign')}</b> · {describeDesign(last.design, t as (k: string) => string)}</span>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="s-btn s-btn-sm" onClick={() => setDesign(last.design)}>{t('pc.useLast')}</button>
                          <Link href={studioHref} className="s-btn s-btn-ghost s-btn-sm">{t('lu.open')}</Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="min-w-0 flex-1 text-[13.5px] s-muted">{t('lu.teaserD')}</p>
                      <Link href={studioHref} className="s-btn s-btn-sm">{t('lu.open')}</Link>
                    </div>
                  )}
                </div>
              )}
              <div>
                <span className="s-lbl">{t('bf.photo')} ({t('c.optional')})</span>
                {photo ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photoPreview && <img src={photoPreview} alt={t('bf.photo')} className="h-24 w-24 rounded-xl object-cover" />}
                    <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={() => { setPhoto(null); setPhotoPreview(null); setLookId(null) }}>{t('bf.photoRemove')}</button>
                    {lookId && <span className="text-[12.5px] s-muted">{t('bf.lookChosen')}</span>}
                  </div>
                ) : (
                  <label className="s-btn s-btn-ghost s-btn-sm cursor-pointer">
                    {uploading ? '…' : t('bf.photoBtn')}
                    <input type="file" accept="image/*" className="sr-only" onChange={e => onPhoto(e.target.files?.[0])} disabled={uploading} />
                  </label>
                )}
              </div>
              <div className="hidden" aria-hidden="true">
                <label htmlFor="bf-website">{t('bf.hp')}</label>
                <input id="bf-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="s-card flex flex-col gap-2 p-4 text-[14px]" style={{ background: 'var(--s-sunk)' }}>
                <b>{t('sf2.policy')}</b>
                <p>{t('sf2.cutoffPolicy', fmtDuration(shop.cutoffMinutes, lang))}</p>
                {shop.note && <p className="whitespace-pre-wrap">{shop.note}</p>}
                <label className="mt-1 flex items-center gap-2 font-semibold">
                  <input type="checkbox" className="h-5 w-5" style={{ accentColor: 'var(--s-accent)' }} checked={form.agree} onChange={e => setForm({ ...form, agree: e.target.checked })} />
                  {t('bf.agree')}
                </label>
                <label className="flex items-center gap-2 s-muted">
                  <input type="checkbox" className="h-5 w-5" style={{ accentColor: 'var(--s-accent)' }} checked={form.marketing} onChange={e => setForm({ ...form, marketing: e.target.checked })} />
                  {t('bf.marketing')}
                </label>
              </div>
              {err && <p className="text-[14px] font-semibold" style={{ color: '#C2362B' }} role="alert">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="s-btn s-btn-ghost" onClick={() => goStep(2)}>{t('c.back')}</button>
                <button type="submit" className="s-btn" disabled={submitting || !shop.live}>{submitting ? '…' : t('bf.confirmBooking')}</button>
              </div>
            </form>
          )}
        </div>
        <div className="hidden lg:sticky lg:top-4 lg:block">{summary}</div>
      </div>

      {step < 3 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t s-line" style={{ background: 'var(--s-bg)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 text-[14px]">
              {step === 2 && slot && date ? <b className="tnum block truncate">{fmtDate(date, lang)} · {fmtTime(slot.start, lang)}</b>
                : <b className="tnum block">{shop.showPrices && total > 0 ? (anyFrom ? t('c.priceFrom', money(total, shop.currency)) : money(total, shop.currency)) : ''}</b>}
              <span className="block truncate s-muted">
                {step === 2 && slot ? guests.map((_, i) => staffName(slot.staff[i])).join(', ') : ready1 ? fmtDuration(Math.max(...guests.map(gs => durationFor(gs, gs.staffId))), lang) : guests.some(gs => gs.serviceIds.length > 0) ? t('bf.answerFirst') : t('bf.nothing')}
              </span>
            </div>
            {step === 1 && <button type="button" className="s-btn" disabled={!ready1} onClick={() => goStep(2)}>{t('bf.toTime')}</button>}
            {step === 2 && <button type="button" className="s-btn" disabled={!slot} onClick={() => goStep(3)}>{t('bf.toDetails')}</button>}
          </div>
        </div>
      )}
      {step === 3 && <div className="mt-6 lg:hidden">{summary}</div>}
    </div>
  )
}

/** A service's description: one short line while the card is unselected, the whole thing once it's picked. */
function Desc({ text, open }: { text: string; open: boolean }) {
  const short = text.length > 42 && !open
  return <> · <span className={short ? 'inline-block max-w-[26ch] truncate align-bottom' : ''}>{text}</span></>
}

function PersonChip({ on, label, sub, color, letter, photo, onClick, disabled }: { on: boolean; label: string; sub: string; color: string; letter: string; photo?: string | null; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} disabled={disabled} className="flex w-[78px] flex-none flex-col items-center gap-1 disabled:opacity-40">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" style={on ? { boxShadow: '0 0 0 3px var(--s-bg), 0 0 0 5px var(--s-accent)' } : {}} />
      ) : (
        <span className="s-display grid h-14 w-14 place-items-center rounded-full text-[20px] text-white" style={{ background: color, ...(on ? { boxShadow: '0 0 0 3px var(--s-bg), 0 0 0 5px var(--s-accent)' } : {}) }}>{letter}</span>
      )}
      <b className="max-w-full truncate text-[13px]">{label}</b>
      <span className="max-w-full truncate text-[11px] s-muted">{sub}</span>
    </button>
  )
}


/** "Nothing that suits you? Join the waitlist" for the chosen day. */
function Waitlist({ slug, date, guest, contact, onContact, prominent }: {
  slug: string; date: string; guest: Guest; contact: { name: string; phone: string; email: string; website: string }
  onContact: (c: { name?: string; phone?: string; email?: string }) => void; prominent: boolean
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [win, setWin] = useState<[number, number]>([0, 1440])
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setState('idle'); setErr(null) }, [date])
  const windows: Array<[string, [number, number]]> = [[t('bf.wAny'), [0, 1440]], [t('c.morning'), [0, 720]], [t('c.afternoon'), [720, 1020]], [t('c.evening'), [1020, 1440]]]
  const send = async () => {
    setErr(null)
    if (!contact.name.trim()) return setErr(t('bf.err.name'))
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(contact.email.trim())) return setErr(t('bf.err.email'))
    setState('sending')
    const res = await fetch(`/api/public/${slug}/waitlist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, fromMin: win[0], toMin: win[1], serviceIds: guest.serviceIds, addonIds: guest.addonIds, staffId: guest.staffId, name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim(), lang, website: contact.website }),
    }).catch(() => null)
    if (res?.ok) { setState('done'); return }
    setState('idle')
    const data = await res?.json().catch(() => ({}))
    setErr(data?.error === 'rate' ? t('bf.err.rate') : data?.detail === 'phone' ? t('bf.err.phone') : t('c.error'))
  }
  if (state === 'done') return <p className="s-card p-4 text-[14px] font-semibold" role="status">✓ {t('bf.wDone', fmtDate(date, lang))}</p>
  if (!open) {
    return prominent
      ? <button type="button" className="s-btn s-btn-ghost self-start" onClick={() => setOpen(true)}>{t('bf.wJoin', fmtDate(date, lang))}</button>
      : <button type="button" className="self-start text-[13.5px] underline underline-offset-2 s-muted" onClick={() => setOpen(true)}>{t('bf.wNone')}</button>
  }
  return (
    <div className="s-card flex flex-col gap-3 p-4">
      <b>{t('bf.wTitle', fmtDate(date, lang))}</b>
      <p className="text-[13.5px] s-muted">{t('bf.wHow')}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('bf.wWhen')}>
        {windows.map(([label, w]) => <button key={label} type="button" role="radio" aria-checked={win[0] === w[0] && win[1] === w[1]} className="s-pill !px-4" aria-pressed={win[0] === w[0] && win[1] === w[1]} onClick={() => setWin(w)}>{label}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="s-lbl" htmlFor="wl-name">{t('c.name')} *</label><input id="wl-name" className="s-inp" autoComplete="name" value={contact.name} onChange={e => onContact({ name: e.target.value })} maxLength={80} /></div>
        <div><label className="s-lbl" htmlFor="wl-email">{t('c.email')} *</label><input id="wl-email" className="s-inp" type="email" autoComplete="email" value={contact.email} onChange={e => onContact({ email: e.target.value })} maxLength={120} /></div>
        <div><label className="s-lbl" htmlFor="wl-phone">{t('c.phone')}</label><input id="wl-phone" className="s-inp tnum" type="tel" autoComplete="tel" value={contact.phone} onChange={e => onContact({ phone: e.target.value })} maxLength={30} /></div>
      </div>
      {err && <p className="text-[14px] font-semibold" style={{ color: '#C2362B' }} role="alert">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="s-btn" disabled={state === 'sending'} onClick={send}>{state === 'sending' ? '…' : t('bf.wSend')}</button>
        <button type="button" className="s-btn s-btn-ghost" onClick={() => setOpen(false)}>{t('c.cancel')}</button>
      </div>
    </div>
  )
}

