'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import type { DictKey } from '@/lib/i18n'
import { fmtDate } from '@/lib/tz'
import { setTagsAction, updateCrmAction } from '../../actions'

type Props = {
  shopId: string; customerId: string
  initial: { tags: string[]; birthday: string | null; source: string; marketingConsent: boolean; marketingConsentAt: string | null; lastContactedAt: string | null }
  suggestions: string[]
}

const SOURCES = ['online', 'walkin', 'phone', 'import', 'manual'] as const

/** Tags, birthday, where the client came from and whether they said yes to marketing. Each field saves on its own. */
export function CrmCard({ shopId, customerId, initial, suggestions }: Props) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [tags, setTags] = useState(initial.tags)
  const [draft, setDraft] = useState('')
  const [birthday, setBirthday] = useState(initial.birthday ?? '')
  const [source, setSource] = useState(initial.source)
  const [consent, setConsent] = useState(initial.marketingConsent)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const commitTags = (next: string[]) => start(async () => {
    setErr(null)
    const r = await setTagsAction(shopId, customerId, next)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setTags(next); router.refresh()
  })
  const addTag = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, ' ')
    if (!v || tags.some(x => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return }
    setDraft(''); commitTags([...tags, v])
  }
  const patch = (p: Parameters<typeof updateCrmAction>[2], after: () => void) => start(async () => {
    setErr(null)
    const r = await updateCrmAction(shopId, customerId, p)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    after(); toast.show(t('c.saved')); router.refresh()
  })
  const unused = suggestions.filter(s => !tags.some(x => x.toLowerCase() === s.toLowerCase())).slice(0, 6)

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="text-[17px] font-bold">{t('cu.crm')}</h2>
      <div>
        <label className="lbl" htmlFor="crm-tag">{t('cu.tags')}</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="chip chip-accent h-7 pr-1 text-[13px]">
              {tag}
              <button type="button" className="ml-0.5 grid h-5 w-5 place-items-center rounded-full hover:bg-black/10" aria-label={`${t('c.delete')} ${tag}`} disabled={pending} onClick={() => commitTags(tags.filter(x => x !== tag))}>×</button>
            </span>
          ))}
          <input id="crm-tag" className="inp inp-sm !w-40" value={draft} placeholder="+" maxLength={24} disabled={pending}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(draft) } else if (e.key === 'Backspace' && !draft && tags.length) commitTags(tags.slice(0, -1)) }}
            onBlur={() => draft.trim() && addTag(draft)} />
        </div>
        {unused.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {unused.map(s => <button key={s} type="button" className="chip h-6 text-[12px] hover:bg-accent-soft" disabled={pending} onClick={() => addTag(s)}>+ {s}</button>)}
          </div>
        )}
        <p className="hint">{t('cu.tagsHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="lbl" htmlFor="crm-bday">{t('cu.birthday')}</label>
          <input id="crm-bday" type="date" className="inp tnum" value={birthday} disabled={pending}
            onChange={e => setBirthday(e.target.value)}
            onBlur={() => { const v = birthday || null; if (v !== (initial.birthday ?? null) && (!v || /^\d{4}-\d{2}-\d{2}$/.test(v))) patch({ birthday: v }, () => { initial.birthday = v }) }} />
        </div>
        <div>
          <label className="lbl" htmlFor="crm-src">{t('cu.source')}</label>
          <select id="crm-src" className="inp" value={source} disabled={pending} onChange={e => { const v = e.target.value as (typeof SOURCES)[number]; setSource(v); patch({ source: v }, () => {}) }}>
            {SOURCES.map(s => <option key={s} value={s}>{t(`cu.source.${s}` as DictKey)}</option>)}
          </select>
        </div>
      </div>
      <label className="chk items-start">
        <input type="checkbox" checked={consent} disabled={pending} onChange={e => { const v = e.target.checked; setConsent(v); patch({ marketingConsent: v }, () => {}) }} />
        <span>
          <b className="block">{t('cu.consent')}</b>
          <span className="hint mt-0">{consent && initial.marketingConsentAt ? t('cu.consentSince', fmtDate(initial.marketingConsentAt.slice(0, 10), lang, { year: 'numeric', month: 'short', day: 'numeric' })) + ' · ' : ''}{t('cu.consentHint')}</span>
        </span>
      </label>
      {initial.lastContactedAt && <p className="text-[13px] text-muted">{t('cu.lastContacted')}: {fmtDate(initial.lastContactedAt.slice(0, 10), lang, { year: 'numeric', month: 'short', day: 'numeric' })}</p>}
      {err && <p className="err">{err}</p>}
      {toast.node}
    </section>
  )
}
