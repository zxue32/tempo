'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n'
import { checkSlug, createShopAction, type SlugCheck } from './actions'
import { TIMEZONES } from '@/lib/regions'
import { normalizeSlug } from '@/lib/slug'
import type { Lang } from '@/lib/types'

export function OnboardingForm({ lang, siteUrl, invite }: { lang: Lang; siteUrl: string; invite: string }) {
  const { t } = useI18n()
  const [state, run, pending] = useActionState(createShopAction, null)
  const [industry, setIndustry] = useState<'nail' | 'barber' | 'both'>('nail')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [check, setCheck] = useState<SlugCheck | null>(null)
  const [meToo, setMeToo] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York'
  const defaultTz = TIMEZONES.some(z => z.id === tz) ? tz : 'America/New_York'

  useEffect(() => {
    if (!slugEdited) setSlug(normalizeSlug(name))
  }, [name, slugEdited])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!slug) { setCheck(null); return }
    timer.current = setTimeout(() => { checkSlug(slug).then(setCheck).catch(() => setCheck(null)) }, 350)
  }, [slug])

  const kinds: Array<['nail' | 'barber' | 'both', string]> = [['nail', t('ind.nail')], ['barber', t('ind.barber')], ['both', t('ind.both')]]
  return (
    <form action={run} className="flex flex-col gap-6">
      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="sr-only">{t('ob.industry')}</legend>
        <span className="lbl !mb-0">{t('ob.industry')}</span>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
          {kinds.map(([k, label]) => (
            <label key={k} className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-4 font-bold ${industry === k ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
              <input type="radio" name="industry" value={k} checked={industry === k} onChange={() => setIndustry(k)} className="accent-[var(--color-accent)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="lbl" htmlFor="ob-name">{t('ob.shopName')}</label>
          <input id="ob-name" name="name" required maxLength={80} className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Lacquer Nail Studio" />
        </div>
        <div>
          <label className="lbl" htmlFor="ob-name-zh">{t('ob.shopNameZh')} <span className="font-normal">({t('c.optional')})</span></label>
          <input id="ob-name-zh" name="nameZh" maxLength={80} className="inp" />
        </div>
        <div className="sm:col-span-2">
          <label className="lbl" htmlFor="ob-slug">{t('ob.slug')}</label>
          <div className="flex items-stretch overflow-hidden rounded-[10px] border border-line bg-surface focus-within:border-ink">
            <span className="flex items-center bg-sunk px-3 text-[13.5px] text-muted">{siteUrl.replace(/^https?:\/\//, '')}/</span>
            <input id="ob-slug" name="slug" required className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none" value={slug}
              onChange={e => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} autoComplete="off" />
          </div>
          <p className={`mt-1 text-[13px] font-semibold ${check ? (check.ok ? 'text-ok' : 'text-bad') : 'text-muted'}`} aria-live="polite">
            {check ? (check.ok ? '✓ ' + t('ob.slugOk') : t(check.reason!)) : t('ob.slugHint')}
          </p>
        </div>
        <div>
          <label className="lbl" htmlFor="ob-phone">{t('ob.phone')}</label>
          <input id="ob-phone" name="phone" type="tel" className="inp" placeholder="(555) 555-0123" />
        </div>
        <div>
          <label className="lbl" htmlFor="ob-city">{t('ob.city')}</label>
          <input id="ob-city" name="city" className="inp" />
        </div>
        <div className="sm:col-span-2">
          <label className="lbl" htmlFor="ob-address">{t('ob.address')}</label>
          <input id="ob-address" name="address" className="inp" />
        </div>
        <div>
          <label className="lbl" htmlFor="ob-tz">{t('ob.timezone')}</label>
          <select id="ob-tz" name="timezone" className="inp" defaultValue={defaultTz}>
            {TIMEZONES.map(z => <option key={z.id} value={z.id}>{lang === 'zh' ? z.zh : z.en}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="ob-lang">{t('ob.defaultLang')}</label>
          <select id="ob-lang" name="defaultLang" className="inp" defaultValue="en">
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-5">
        <label className="chk"><input type="checkbox" name="meToo" checked={meToo} onChange={e => setMeToo(e.target.checked)} />{t('ob.meToo')}</label>
        {meToo && (
          <div className="max-w-sm">
            <label className="lbl" htmlFor="ob-my">{t('ob.myName')}</label>
            <input id="ob-my" name="myName" className="inp" maxLength={60} />
          </div>
        )}
        <div className="max-w-sm">
          <label className="lbl" htmlFor="ob-invite">{t('auth.invite')} <span className="font-normal">({t('c.optional')})</span></label>
          <input id="ob-invite" name="invite" defaultValue={invite} className="inp uppercase" autoComplete="off" />
          <p className="hint">{t('auth.inviteHint')}</p>
        </div>
      </div>

      {state?.error && <p className="err" role="alert">{t(state.error)}</p>}
      <div><button className="btn btn-primary !min-h-[48px] !px-6" disabled={pending || (check !== null && !check.ok)}>{pending ? '…' : t('ob.create')}</button></div>
    </form>
  )
}
