'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import { THEMES } from '@/lib/themes'
import { TIMEZONES } from '@/lib/regions'
import { fmtDuration, hhmm, parseHHMM } from '@/lib/tz'
import type { Hours, Shop } from '@/lib/types'
import { saveSettingsAction, uploadImageAction } from '../actions'

export function SettingsForm({ shop, siteUrl }: { shop: Shop; siteUrl: string }) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const init = {
    name: shop.name, nameZh: shop.nameZh ?? '', aboutEn: shop.aboutEn ?? '', aboutZh: shop.aboutZh ?? '', phone: shop.phone ?? '', email: shop.email ?? '',
    address: shop.address ?? '', city: shop.city ?? '', mapUrl: shop.mapUrl ?? '', instagram: shop.instagram ?? '', industry: shop.industry,
    theme: shop.theme, accent: shop.accent ?? '', logoUrl: shop.logoUrl, coverUrl: shop.coverUrl, timezone: shop.timezone, defaultLang: shop.defaultLang,
    hours: shop.hours as Hours, slotMinutes: shop.slotMinutes, leadMinutes: shop.leadMinutes, maxDays: shop.maxDays, cancelCutoffMinutes: shop.cancelCutoffMinutes,
    bufferMinutes: shop.bufferMinutes, maxGuests: shop.maxGuests, allowAnyStaff: shop.allowAnyStaff, showPrices: shop.showPrices,
    bookingNoteEn: shop.bookingNoteEn ?? '', bookingNoteZh: shop.bookingNoteZh ?? '', notifyEmails: (shop.notifyEmails ?? []).join(', '), notifyStaff: shop.notifyStaff,
  }
  const [v, setV] = useState(init)
  const [saved, setSaved] = useState(init)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const f = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV(x => ({ ...x, [k]: val }))
  const word = t(`staffWord.${v.industry}`)

  const save = () => start(async () => {
    setErr(null)
    const emails = v.notifyEmails.split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    const r = await saveSettingsAction(shop.id, {
      ...v, accent: v.accent || null, nameZh: v.nameZh || null, aboutEn: v.aboutEn || null, aboutZh: v.aboutZh || null, phone: v.phone || null, email: v.email || null,
      address: v.address || null, city: v.city || null, mapUrl: v.mapUrl || null, instagram: v.instagram || null,
      bookingNoteEn: v.bookingNoteEn || null, bookingNoteZh: v.bookingNoteZh || null, notifyEmails: emails,
      slotMinutes: v.slotMinutes as 5 | 10 | 15 | 20 | 30 | 60,
    })
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setSaved(v)
    toast.show(t('c.saved'))
    router.refresh()
  })
  const upload = async (field: 'logoUrl' | 'coverUrl', file: File | undefined) => {
    if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('kind', 'shop')
    const r = await uploadImageAction(shop.id, fd)
    if (r.ok) f(field, r.url); else setErr(t('sg.uploadFailed', r.detail || r.error))
  }
  const setHour = (wd: string, patch: Partial<Hours[string]>) => f('hours', { ...v.hours, [wd]: { ...(v.hours[wd] ?? { closed: true, open: 600, close: 1140 }), ...patch } })
  const wdNames = t('c.weekdaysLong').split(',')
  const leadOpts = [0, 30, 60, 120, 180, 240, 480, 720, 1440, 2880]
  const cutOpts = [0, 60, 120, 240, 480, 720, 1440, 2880]

  return (
    <div className="flex flex-col gap-6 pb-20">
      <Section title={t('sg.info')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <In id="s-name" label={t('ob.shopName')} value={v.name} onChange={x => f('name', x)} />
          <In id="s-namezh" label={t('ob.shopNameZh')} value={v.nameZh} onChange={x => f('nameZh', x)} />
          <In id="s-phone" label={t('ob.phone')} value={v.phone} onChange={x => f('phone', x)} />
          <In id="s-email" label={t('sg.contactEmail')} value={v.email} onChange={x => f('email', x)} />
          <In id="s-address" label={t('ob.address')} value={v.address} onChange={x => f('address', x)} />
          <In id="s-city" label={t('ob.city')} value={v.city} onChange={x => f('city', x)} />
          <In id="s-map" label={t('sg.mapUrl')} value={v.mapUrl} onChange={x => f('mapUrl', x)} placeholder="https://maps.google.com/…" />
          <In id="s-ig" label={t('sg.instagram')} value={v.instagram} onChange={x => f('instagram', x)} placeholder="@yourshop" />
          <div>
            <label className="lbl" htmlFor="s-ind">{t('ob.industry')}</label>
            <select id="s-ind" className="inp" value={v.industry} onChange={e => f('industry', e.target.value as typeof v.industry)}>
              <option value="nail">{t('ind.nail')}</option><option value="barber">{t('ind.barber')}</option><option value="both">{t('ind.both')}</option>
            </select>
          </div>
          <div>
            <span className="lbl">{t('sg.link')}</span>
            <div className="tnum rounded-[10px] border border-line bg-sunk px-3 py-2.5 text-[14px]">{siteUrl.replace(/^https?:\/\//, '')}/<b>{shop.slug}</b></div>
            <p className="hint">{t('sg.linkLocked')}</p>
          </div>
        </div>
      </Section>

      <Section title={t('sg.about')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Ta id="s-aen" label={t('sg.aboutEn')} value={v.aboutEn} onChange={x => f('aboutEn', x)} />
          <Ta id="s-azh" label={t('sg.aboutZh')} value={v.aboutZh} onChange={x => f('aboutZh', x)} />
        </div>
      </Section>

      <Section title={t('sg.look')} id="look">
        <div role="radiogroup" aria-label={t('sg.theme')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(THEMES).map(th => (
            <button key={th.id} type="button" role="radio" aria-checked={v.theme === th.id} onClick={() => f('theme', th.id)}
              className={`overflow-hidden rounded-xl border text-left ${v.theme === th.id ? 'border-accent shadow-[0_0_0_3px_var(--color-accent-soft)]' : 'border-line'}`}>
              <span className="flex h-20 flex-col justify-between p-3" style={{ background: th.bg, color: th.ink, borderBottom: `1px solid ${th.line}` }}>
                <span style={{ fontFamily: th.display, textTransform: th.displayCase, fontSize: 24, lineHeight: 1 }}>Aa</span>
                <span className="block h-3 w-3/5" style={{ background: v.theme === th.id && v.accent ? v.accent : th.accent, borderRadius: th.radius }} />
              </span>
              <span className="block bg-surface px-3 py-2"><b className="block text-[14px]">{th.label[lang]}</b><span className="text-[12px] text-muted">{th.note[lang]}</span></span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="lbl" htmlFor="s-accent">{t('sg.accent')}</label>
            <div className="flex items-center gap-2">
              <input id="s-accent" type="color" className="h-10 w-12 cursor-pointer rounded border border-line" value={v.accent || THEMES[v.theme]?.accent || '#A3223D'} onChange={e => f('accent', e.target.value)} />
              <input aria-label={t('sg.accent')} className="inp tnum !w-28" value={v.accent} onChange={e => f('accent', e.target.value)} placeholder={THEMES[v.theme]?.accent} />
              {v.accent && <button className="btn btn-sm btn-ghost" onClick={() => f('accent', '')}>{t('sg.remove')}</button>}
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['logoUrl', 'coverUrl'] as const).map(k => (
            <div key={k} className="flex items-center gap-3">
              {v[k]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={v[k]!} alt="" className={`${k === 'logoUrl' ? 'h-16 w-16 rounded-full' : 'h-16 w-28 rounded-lg'} border border-line object-cover`} />
                : <span className={`${k === 'logoUrl' ? 'h-16 w-16 rounded-full' : 'h-16 w-28 rounded-lg'} grid place-items-center border border-dashed border-line text-[12px] text-muted`}>{k === 'logoUrl' ? t('sg.logo') : t('sg.cover')}</span>}
              <div className="flex flex-col gap-1">
                <b className="text-[14px]">{k === 'logoUrl' ? t('sg.logo') : t('sg.cover')}</b>
                <div className="flex gap-2">
                  <label className="btn btn-sm cursor-pointer">{t('sg.upload')}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => upload(k, e.target.files?.[0])} /></label>
                  {v[k] && <button className="btn btn-sm btn-ghost" onClick={() => f(k, null)}>{t('sg.remove')}</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('sg.hours')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4, 5, 6, 0].map(wd => {
            const k = String(wd), h = v.hours[k] ?? { closed: true, open: 600, close: 1140 }
            return (
              <div key={wd} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2">
                <b className="w-20 text-[14px]">{wdNames[wd]}</b>
                <label className="chk text-[13px]"><input type="checkbox" checked={h.closed} onChange={e => setHour(k, { closed: e.target.checked })} />{t('c.closed')}</label>
                {!h.closed && (
                  <span className="flex items-center gap-1">
                    <input type="time" step={900} aria-label={`${wdNames[wd]} ${t('c.start')}`} className="inp inp-sm tnum !w-28" value={hhmm(h.open)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) setHour(k, { open: m }) }} />
                    –
                    <input type="time" step={900} aria-label={`${wdNames[wd]} ${t('c.end')}`} className="inp inp-sm tnum !w-28" value={hhmm(h.close)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) setHour(k, { close: m }) }} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title={t('sg.rules')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Sel id="s-slot" label={t('sg.slot')} value={v.slotMinutes} onChange={x => f('slotMinutes', x)} options={[5, 10, 15, 20, 30, 60].map(m => [m, t('sg.mins', m)])} />
          <Sel id="s-lead" label={t('sg.lead')} value={v.leadMinutes} onChange={x => f('leadMinutes', x)} options={leadOpts.map(m => [m, m ? fmtDuration(m, lang) : t('sg.none')])} />
          <div><label className="lbl" htmlFor="s-max">{t('sg.maxDays')}</label><input id="s-max" type="number" min={1} max={365} className="inp tnum" value={v.maxDays} onChange={e => f('maxDays', Math.max(1, Math.min(365, +e.target.value || 1)))} /></div>
          <Sel id="s-cut" label={t('sg.cutoff')} value={v.cancelCutoffMinutes} onChange={x => f('cancelCutoffMinutes', x)} options={cutOpts.map(m => [m, m ? t('sg.minutesBefore', String(m / 60)) : t('sg.none')])} />
          <Sel id="s-buf" label={t('sg.buffer')} value={v.bufferMinutes} onChange={x => f('bufferMinutes', x)} options={[0, 5, 10, 15, 20, 30].map(m => [m, m ? t('sg.mins', m) : t('sg.none')])} />
          <Sel id="s-guests" label={t('sg.maxGuests')} value={v.maxGuests} onChange={x => f('maxGuests', x)} options={[1, 2, 3, 4, 5, 6, 8, 10].map(n => [n, String(n)])} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="chk"><input type="checkbox" checked={v.allowAnyStaff} onChange={e => f('allowAnyStaff', e.target.checked)} />{t('sg.anyStaff', word)}</label>
          <label className="chk"><input type="checkbox" checked={v.showPrices} onChange={e => f('showPrices', e.target.checked)} />{t('sg.showPrices')}</label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Ta id="s-nen" label={t('sg.noteEn')} value={v.bookingNoteEn} onChange={x => f('bookingNoteEn', x)} />
          <Ta id="s-nzh" label={t('sg.noteZh')} value={v.bookingNoteZh} onChange={x => f('bookingNoteZh', x)} />
        </div>
      </Section>

      <Section title={t('sg.notify')}>
        <In id="s-notify" label={t('sg.notifyEmails')} value={v.notifyEmails} onChange={x => f('notifyEmails', x)} />
        <label className="chk"><input type="checkbox" checked={v.notifyStaff} onChange={e => f('notifyStaff', e.target.checked)} />{t('sg.notifyStaff')}</label>
      </Section>

      <Section title={t('sg.region')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="lbl" htmlFor="s-tz">{t('ob.timezone')}</label>
            <select id="s-tz" className="inp" value={v.timezone} onChange={e => f('timezone', e.target.value)}>
              {!TIMEZONES.some(z => z.id === v.timezone) && <option value={v.timezone}>{v.timezone}</option>}
              {TIMEZONES.map(z => <option key={z.id} value={z.id}>{lang === 'zh' ? z.zh : z.en}</option>)}
            </select></div>
          <div><label className="lbl" htmlFor="s-lang">{t('ob.defaultLang')}</label>
            <select id="s-lang" className="inp" value={v.defaultLang} onChange={e => f('defaultLang', e.target.value as 'zh' | 'en')}>
              <option value="en">English</option><option value="zh">中文</option>
            </select></div>
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:left-[240px]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {err ? <span className="err min-w-0 flex-1">{err}</span> : <span className="min-w-0 flex-1 text-[13px] text-muted">{dirty ? t('sc.unsaved') : ''}</span>}
          {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setV(saved)}>{t('c.cancel')}</button>}
          <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? t('c.saving') : t('c.save')}</button>
        </div>
      </div>
      {toast.node}
    </div>
  )
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return <section id={id} className="card flex scroll-mt-4 flex-col gap-4 p-5"><h2 className="text-[17px] font-bold">{title}</h2>{children}</section>
}
function In({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="min-w-0"><label className="lbl" htmlFor={id}>{label}</label><input id={id} className="inp" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></div>
}
function Ta({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return <div className="min-w-0"><label className="lbl" htmlFor={id}>{label}</label><textarea id={id} className="inp" value={value} onChange={e => onChange(e.target.value)} maxLength={2000} /></div>
}
function Sel({ id, label, value, onChange, options }: { id: string; label: string; value: number; onChange: (v: number) => void; options: Array<[number, string]> }) {
  const opts = options.some(([v]) => v === value) ? options : [[value, String(value)] as [number, string], ...options]
  return <div className="min-w-0"><label className="lbl" htmlFor={id}>{label}</label><select id={id} className="inp" value={value} onChange={e => onChange(+e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
}
