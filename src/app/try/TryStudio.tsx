'use client'
// The demo studio for shop owners, with the storefront themes to try on: the page and the studio
// both take the picked theme's colours, the way they do on a real shop's /{slug}/design page.
import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n'
import { LuneStudio } from '@/components/LuneStudio'
import { THEMES, studioVars } from '@/lib/themes'

export function TryStudio({ platform }: { platform: string }) {
  const { t, lang } = useI18n()
  const [id, setId] = useState('lacquer')
  const th = THEMES[id]
  return (
    <div className="min-h-screen transition-colors duration-500" style={{ background: th.bg, color: th.ink, colorScheme: th.dark ? 'dark' : 'light' }}>
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[18px] font-bold no-underline" style={{ color: th.ink }}>
          <svg width="24" height="24" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill={th.block} /><path d="M15 7v8l5 3" stroke={th.blockInk} strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="22" cy="8" r="2.6" fill={th.pop} /></svg>
          {platform}
        </Link>
        <p className="min-w-0 flex-1 text-[13.5px]" style={{ color: th.muted }}>{t('lu.tryNote')}</p>
        <Link href="/signup" className="px-4 py-2 text-[14px] font-semibold no-underline" style={{ background: th.accent, color: th.accentInk, borderRadius: th.radius }}>{t('home.cta')}</Link>
      </header>
      <div className="mx-auto max-w-[1440px] px-4 pb-3 sm:px-6">
        <div role="radiogroup" aria-label={t('lu.themes')} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <span className="flex-none text-[13px]" style={{ color: th.muted }}>{t('lu.themes')}</span>
          {Object.values(THEMES).map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === id} onClick={() => setId(x.id)}
              className="flex flex-none items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-[13px] transition-transform active:scale-95"
              style={{ borderColor: x.id === id ? th.ink : th.line, background: x.id === id ? th.surface : 'transparent', color: th.ink }}>
              <span aria-hidden="true" className="relative h-6 w-6 overflow-hidden rounded-full" style={{ background: x.bg, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
                <span className="absolute inset-y-0 left-0 w-1/2" style={{ background: x.block }} />
                <span className="absolute bottom-0 right-0 h-1/2 w-1/2" style={{ background: x.pop }} />
              </span>
              {x.label[lang]}
            </button>
          ))}
        </div>
      </div>
      <main className="mx-auto max-w-[1440px] px-2 pb-10 sm:px-4">
        <h1 className="sr-only">{t('lu.title')}</h1>
        <LuneStudio storageKey="tempo.lune:try" brand={platform} vars={studioVars(id)} labels={{ loading: t('lu.loading'), failed: t('lu.failed') }} />
        <p className="mx-auto mt-4 max-w-3xl px-2 text-center text-[13px]" style={{ color: th.muted }}>{t('lu.note')}</p>
      </main>
    </div>
  )
}
