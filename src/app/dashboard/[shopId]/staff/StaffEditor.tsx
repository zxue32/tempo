'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import { pick, type DictKey } from '@/lib/i18n'
import { hhmm, parseHHMM } from '@/lib/tz'
import { STAFF_COLORS } from '@/lib/themes'
import type { Hours, Industry, Service, Skill, Staff } from '@/lib/types'
import { saveStaffAction, deleteStaffAction, setSkillsAction, inviteStaffAction, uploadImageAction, reorderStaffAction } from '../actions'

type Member = { userId: string; email: string; role: string; staffId: string | null }
type Week = Record<string, { start: number; end: number; breaks: [number, number][] }>

export function StaffEditor({ shopId, industry, hours, staff, services, skills, members, invites }: {
  shopId: string; industry: Industry; hours: Hours; staff: Staff[]; services: Service[]; skills: Skill[]; members: Member[]; invites: { email: string; staffId: string | null }[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [pending, start] = useTransition()
  const move = (i: number, dir: -1 | 1) => start(async () => {
    const ids = staff.map(s => s.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reorderStaffAction(shopId, ids)
    router.refresh()
  })
  return (
    <div className="flex flex-col gap-4">
      <div><button className="btn btn-primary" onClick={() => setAdding(true)} disabled={adding}>+ {t('sf.add')}</button></div>
      {adding && <StaffCard shopId={shopId} industry={industry} hours={hours} services={services} skills={skills} members={members} invites={invites} staff={null} defaultColor={STAFF_COLORS[staff.length % STAFF_COLORS.length]} onDone={() => { setAdding(false); router.refresh() }} />}
      {staff.length === 0 && !adding && <p className="text-muted">{t('sf.empty')}</p>}
      {staff.map((s, i) => (
        <div key={s.id} className="flex gap-2">
          <div className="flex flex-col gap-1 pt-4">
            <button className="btn btn-sm btn-ghost !px-2" aria-label={t('sv.moveUp')} disabled={i === 0 || pending} onClick={() => move(i, -1)}>↑</button>
            <button className="btn btn-sm btn-ghost !px-2" aria-label={t('sv.moveDown')} disabled={i === staff.length - 1 || pending} onClick={() => move(i, 1)}>↓</button>
          </div>
          <div className="min-w-0 flex-1">
            <StaffCard shopId={shopId} industry={industry} hours={hours} services={services} skills={skills} members={members} invites={invites} staff={s} defaultColor={s.color} onDone={() => router.refresh()} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StaffCard({ shopId, industry, hours, services, skills, members, invites, staff, defaultColor, onDone }: {
  shopId: string; industry: Industry; hours: Hours; services: Service[]; skills: Skill[]; members: Member[]; invites: { email: string; staffId: string | null }[]
  staff: Staff | null; defaultColor: string; onDone: () => void
}) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const isNew = !staff
  const [open, setOpen] = useState(isNew)
  const [v, setV] = useState({
    name: staff?.name ?? '', nameZh: staff?.nameZh ?? '', bioEn: staff?.bioEn ?? '', bioZh: staff?.bioZh ?? '', color: staff?.color ?? defaultColor,
    photoUrl: staff?.photoUrl ?? null as string | null, active: staff?.active ?? true, bookableOnline: staff?.bookableOnline ?? true, commissionPct: staff?.commissionPct ?? 40,
  })
  const initialWeek: Week = staff?.defaultWeek && Object.keys(staff.defaultWeek).length ? (staff.defaultWeek as Week)
    : Object.fromEntries(Object.entries(hours).filter(([, h]) => !h.closed).map(([wd, h]) => [wd, { start: h.open, end: h.close, breaks: [] }]))
  const [week, setWeek] = useState<Week>(initialWeek)
  const mine = new Map(skills.filter(k => k.staffId === staff?.id).map(k => [k.serviceId, k.durationMin]))
  const [sk, setSk] = useState<Map<string, number | null>>(isNew ? new Map(services.filter(s => s.active).map(s => [s.id, null])) : mine)
  const [inviteEmail, setInviteEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const linked = members.find(m => m.staffId === staff?.id)
  const invited = invites.find(i => i.staffId === staff?.id)
  const wdNames = t('c.weekdays').split(',')

  const save = () => start(async () => {
    setErr(null)
    if (!v.name.trim()) { setErr(t('sf.nameEn') + ' ✕'); return }
    const r = await saveStaffAction(shopId, staff?.id ?? null, { ...v, nameZh: v.nameZh, bioEn: v.bioEn, bioZh: v.bioZh, defaultWeek: week })
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    const s2 = await setSkillsAction(shopId, r.id, Array.from(sk.entries()).map(([serviceId, durationMin]) => ({ serviceId, durationMin })))
    if (!s2.ok) { setErr(errText(t, s2.error)); return }
    toast.show(t('c.saved'))
    if (isNew) onDone(); else { onDone(); setOpen(false) }
  })

  const upload = async (file: File | undefined) => {
    if (!file || !staff) return
    const fd = new FormData(); fd.append('file', file); fd.append('kind', 'staff')
    const r = await uploadImageAction(shopId, fd)
    if (r.ok) setV(x => ({ ...x, photoUrl: r.url })); else setErr(t('sg.uploadFailed', r.detail || r.error))
  }

  if (!open && staff) {
    return (
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="nail !h-4 !w-4" style={{ ['--c' as string]: staff.color }} />
        <b className="min-w-0">{pick(lang, staff.name, staff.nameZh)}</b>
        {!staff.active && <span className="chip">{t('sf.active')} ✕</span>}
        {staff.active && !staff.bookableOnline && <span className="chip chip-warn">{t('sf.online')} ✕</span>}
        <span className="text-[13px] text-muted">{t('sf.skills')}: {mine.size}</span>
        {linked && <span className="chip chip-ok">{t('sf.joined', linked.email)}</span>}
        <span className="flex-1" />
        <button className="btn btn-sm" onClick={() => setOpen(true)}>{t('c.edit')}</button>
        {toast.node}
      </div>
    )
  }

  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
        <div className="flex flex-col items-center gap-1">
          {v.photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={v.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            : <span className="grid h-16 w-16 place-items-center rounded-full text-[22px] font-bold text-white" style={{ background: v.color }}>{(v.name || '?').charAt(0).toUpperCase()}</span>}
          {staff && <label className="cursor-pointer text-[12px] font-semibold text-accent">{t('sf.upload')}<input type="file" accept="image/*" className="sr-only" onChange={e => upload(e.target.files?.[0])} /></label>}
        </div>
        <div><label className="lbl" htmlFor={`n-${staff?.id ?? 'new'}`}>{t('sf.nameEn')}</label><input id={`n-${staff?.id ?? 'new'}`} className="inp" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} maxLength={60} /></div>
        <div><label className="lbl" htmlFor={`nz-${staff?.id ?? 'new'}`}>{t('sf.nameZh')}</label><input id={`nz-${staff?.id ?? 'new'}`} className="inp" value={v.nameZh} onChange={e => setV({ ...v, nameZh: e.target.value })} maxLength={60} /></div>
        <div className="sm:col-start-2"><label className="lbl" htmlFor={`be-${staff?.id ?? 'new'}`}>{t('sf.bioEn')}</label><input id={`be-${staff?.id ?? 'new'}`} className="inp" value={v.bioEn} onChange={e => setV({ ...v, bioEn: e.target.value })} maxLength={300} /></div>
        <div><label className="lbl" htmlFor={`bz-${staff?.id ?? 'new'}`}>{t('sf.bioZh')}</label><input id={`bz-${staff?.id ?? 'new'}`} className="inp" value={v.bioZh} onChange={e => setV({ ...v, bioZh: e.target.value })} maxLength={300} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="lbl !mb-0">{t('sf.color')}</span>
          <div className="flex gap-1">{STAFF_COLORS.map(c => <button key={c} type="button" aria-label={c} aria-pressed={v.color === c} onClick={() => setV({ ...v, color: c })} className="h-6 w-6 rounded-full" style={{ background: c, boxShadow: v.color === c ? '0 0 0 2px #fff, 0 0 0 4px #16171B' : undefined }} />)}</div>
        </div>
        <label className="chk"><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked, bookableOnline: e.target.checked ? v.bookableOnline : false })} />{t('sf.active')}</label>
        <label className="chk" title={t('sf.onlineHint')}><input type="checkbox" checked={v.bookableOnline} disabled={!v.active} onChange={e => setV({ ...v, bookableOnline: e.target.checked })} />{t('sf.online')}</label>
        <div className="flex items-center gap-2">
          <label className="lbl !mb-0" htmlFor={`pct-${staff?.id ?? 'new'}`}>{t('sf.commission')}</label>
          <input id={`pct-${staff?.id ?? 'new'}`} type="number" min={0} max={100} className="inp inp-sm tnum !w-20" value={v.commissionPct} onChange={e => setV({ ...v, commissionPct: Math.max(0, Math.min(100, +e.target.value || 0)) })} />
        </div>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><span className="lbl !mb-0">{t('sf.skills')}</span><span className="hint !mt-0">{t('sf.ownDuration')}: {t('sf.ownDurationHint')}</span></div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(s => {
            const on = sk.has(s.id)
            return (
              <div key={s.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? 'border-accent bg-accent-soft' : 'border-line'} ${s.active ? '' : 'opacity-50'}`}>
                <label className="chk min-w-0 flex-1 text-[13.5px]"><input type="checkbox" checked={on} onChange={e => { const m = new Map(sk); if (e.target.checked) m.set(s.id, null); else m.delete(s.id); setSk(m) }} /><span className="truncate">{pick(lang, s.name, s.nameZh)} <span className="text-muted">({t(`cat.${s.category}` as DictKey)})</span></span></label>
                {on && <input type="number" min={5} max={600} step={5} aria-label={`${pick(lang, s.name, s.nameZh)} ${t('sf.ownDuration')}`} placeholder={String(s.durationMin)} className="inp inp-sm tnum !h-8 !w-16"
                  value={sk.get(s.id) ?? ''} onChange={e => { const m = new Map(sk); m.set(s.id, e.target.value ? Math.max(5, +e.target.value) : null); setSk(m) }} />}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <span className="lbl">{t('sf.defaultWeek')}</span>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 0].map(wd => {
            const k = String(wd), c = week[k]
            return (
              <div key={wd} className={`flex flex-col gap-1 rounded-lg border px-2.5 py-2 ${c ? 'border-line' : 'border-line opacity-60'}`}>
                <label className="chk text-[13px] font-semibold"><input type="checkbox" checked={!!c} onChange={e => { const w = { ...week }; if (e.target.checked) { const h = hours[k]; w[k] = { start: h?.open ?? 600, end: h?.close ?? 1140, breaks: [] } } else delete w[k]; setWeek(w) }} />{wdNames[wd]}</label>
                {c && (
                  <div className="flex items-center gap-1">
                    <input type="time" step={900} aria-label={`${wdNames[wd]} ${t('c.start')}`} className="inp inp-sm tnum !px-1" value={hhmm(c.start)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) setWeek({ ...week, [k]: { ...c, start: m } }) }} />
                    <span>–</span>
                    <input type="time" step={900} aria-label={`${wdNames[wd]} ${t('c.end')}`} className="inp inp-sm tnum !px-1" value={hhmm(c.end)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) setWeek({ ...week, [k]: { ...c, end: m } }) }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {staff && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="lbl !mb-0">{t('sf.login')}</span>
          {linked ? <span className="chip chip-ok self-start">{t('sf.joined', linked.email)}</span> : (
            <>
              <p className="hint !mt-0">{t('sf.loginHint')}</p>
              {invited && <span className="chip self-start">{t('sf.invited', invited.email)}</span>}
              <div className="flex flex-wrap gap-2">
                <input type="email" className="inp !w-72 max-w-full" placeholder="name@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} aria-label={t('c.email')} />
                <button className="btn btn-sm" disabled={!inviteEmail || pending} onClick={() => start(async () => {
                  const r = await inviteStaffAction(shopId, staff.id, inviteEmail)
                  if (r.ok) { toast.show(t('sf.invited', inviteEmail)); setInviteEmail(''); onDone() } else setErr(errText(t, r.error, r.detail))
                })}>{t('sf.invite')}</button>
              </div>
            </>
          )}
        </div>
      )}

      {err && <p className="err" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending} onClick={save}>{pending ? '…' : t('c.save')}</button>
        {staff && <button className="btn btn-ghost" onClick={() => setOpen(false)}>{t('c.close')}</button>}
        {isNew && <button className="btn btn-ghost" onClick={onDone}>{t('c.cancel')}</button>}
        <span className="flex-1" />
        {staff && <button className="btn btn-danger btn-ghost" disabled={pending} onClick={() => {
          if (!window.confirm(t('sf.confirmDelete', staff.name))) return
          start(async () => { const r = await deleteStaffAction(shopId, staff.id); if (r.ok) { toast.show(r.result === 'deleted' ? t('sf.deleted') : t('sf.deactivated')); onDone() } })
        }}>{t('c.delete')}</button>}
      </div>
      {toast.node}
    </div>
  )
}
