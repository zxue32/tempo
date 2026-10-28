import Link from 'next/link'
import { getLang } from '@/lib/i18n/server'
import { makeT } from '@/lib/i18n'
import { env } from '@/lib/env'
import { LuneStudio } from '@/components/LuneStudio'

export const metadata = { title: `3D 试色台 · ${env.platformName}` }

/** The 3D nail studio on its own, for shop owners to try from the front page (no shop, no booking). */
export default async function TryStudio() {
  const lang = await getLang()
  const t = makeT(lang)
  return (
    <div className="min-h-screen" style={{ background: '#f4efe9', color: '#342e2c' }}>
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[18px] font-bold no-underline" style={{ color: '#342e2c' }}>
          <svg width="24" height="24" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="#0B0A14" /><path d="M15 7v8l5 3" stroke="#F4F1F8" strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="22" cy="8" r="2.6" fill="#8C9BFF" /></svg>
          {env.platformName}
        </Link>
        <p className="min-w-0 flex-1 text-[13.5px]" style={{ color: '#6f6560' }}>{t('lu.tryNote')}</p>
        <Link href="/signup" className="rounded-full px-4 py-2 text-[14px] font-semibold text-white no-underline" style={{ background: '#783c4a' }}>{t('home.cta')}</Link>
      </header>
      <main className="mx-auto max-w-[1440px] px-2 pb-10 sm:px-4">
        <h1 className="sr-only">{t('lu.title')}</h1>
        <LuneStudio storageKey="tempo.lune:try" brand={env.platformName} labels={{ loading: t('lu.loading'), failed: t('lu.failed') }} />
        <p className="mx-auto mt-4 max-w-3xl px-2 text-center text-[13px]" style={{ color: '#6f6560' }}>{t('lu.note')}</p>
      </main>
    </div>
  )
}
