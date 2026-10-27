import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { getUser } from '@/lib/auth'
import { PlatformMark } from '@/components/ui'
import { LangToggle } from '@/components/i18n'
import { env } from '@/lib/env'

export default async function Home() {
  const { t } = await getT()
  const user = await getUser().catch(() => null)
  const features: Array<[string, string]> = [
    [t('home.f1t'), t('home.f1d')], [t('home.f2t'), t('home.f2d')], [t('home.f3t'), t('home.f3d')],
    [t('home.f4t'), t('home.f4d')], [t('home.f5t'), t('home.f5d')], [t('home.f6t'), t('home.f6d')],
  ]
  const steps: Array<[string, string]> = [[t('home.h1t'), t('home.h1d')], [t('home.h2t'), t('home.h2d')], [t('home.h3t'), t('home.h3d')]]
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="text-ink no-underline"><PlatformMark /></Link>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            {user ? (
              <Link href="/dashboard" className="btn btn-primary">{t('home.dashboard')}</Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost">{t('home.login')}</Link>
                <Link href="/signup" className="btn btn-primary">{t('home.cta')}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.1fr_1fr] md:items-center md:py-20">
          <div className="flex min-w-0 flex-col gap-5">
            <span className="self-start rounded-full bg-accent-soft px-3 py-1 text-[13px] font-bold tracking-wide text-accent-deep">{t('home.eyebrow')}</span>
            <h1 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-tight sm:text-[56px]">{t('home.title')}</h1>
            <p className="max-w-[34em] text-[17px] text-ink-2">{t('home.sub')}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={user ? '/onboarding' : '/signup'} className="btn btn-primary !min-h-[50px] !px-6 !text-[16px]">{t('home.cta')}</Link>
              {!user && <Link href="/login" className="btn !min-h-[50px] !px-6 !text-[16px]">{t('home.login')}</Link>}
            </div>
            <p className="text-sm text-muted">{t('home.note')}</p>
          </div>
          <HeroPreview />
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-8 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {features.map(([title, body]) => (
              <div key={title} className="border-b border-line py-6">
                <h2 className="mb-1 text-[18px] font-bold">{title}</h2>
                <p className="text-[15px] text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display mb-6 text-[32px] font-extrabold tracking-tight">{t('home.howTitle')}</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map(([title, body], i) => (
              <li key={title} className="card flex flex-col gap-2 p-5">
                <span className="font-display text-[32px] font-extrabold leading-none text-accent">{i + 1}</span>
                <h3 className="text-[17px] font-bold">{title}</h3>
                <p className="text-[15px] text-ink-2">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <Link href={user ? '/onboarding' : '/signup'} className="btn btn-primary !min-h-[50px] !px-6 !text-[16px]">{t('home.cta')}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <span className="font-semibold text-ink">{env.platformName}</span>
          <span>{t('home.footer')}</span>
        </div>
      </footer>
    </div>
  )
}

function HeroPreview() {
  const cols: Array<{ name: string; color: string; blocks: Array<[number, number, string, string, boolean?]> }> = [
    { name: 'Mia', color: '#C8445A', blocks: [[0, 22, 'Emily R.', 'Gel-X + Art'], [39, 11, 'Grace K.', 'Gel Manicure', true], [56, 22, 'Sophia L.', 'Gel-X']] },
    { name: 'Luna', color: '#8E5BA8', blocks: [[11, 9, 'Hannah W.', 'Gel Manicure'], [47, 11, 'Ava P.', 'BIAB']] },
    { name: 'Dre', color: '#3B5A8A', blocks: [[5, 6, 'Walk-in', 'Haircut'], [22, 9, 'Jordan P.', 'Skin Fade', true], [60, 9, 'Sam R.', 'Cut + Beard']] },
  ]
  return (
    <div aria-hidden="true" className="relative min-w-0">
      <div className="card overflow-hidden shadow-[0_24px_60px_rgba(22,23,27,.10)]">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3 text-sm">
          <b>Wed, Oct 14</b>
          <span className="text-muted">10a – 7p</span>
        </div>
        <div className="grid grid-cols-3">
          {cols.map(c => (
            <div key={c.name} className="border-l border-line-soft first:border-l-0">
              <div className="flex items-center gap-2 px-3 py-2 text-[13px] font-bold"><span className="nail" style={{ ['--c' as string]: c.color }} />{c.name}</div>
              <div className="relative h-[300px] border-t border-line-soft">
                {c.blocks.map(([top, h, who, what, now]) => (
                  <div key={who + top} className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[11px] leading-tight"
                    style={{ top: `${top}%`, height: `${h}%`, background: now ? c.color : `color-mix(in srgb, ${c.color} 16%, white)`, color: now ? '#fff' : '#16171B', border: `1px solid ${now ? c.color : `color-mix(in srgb, ${c.color} 45%, white)`}` }}>
                    <b className="block truncate">{who}</b><span className="opacity-80">{what}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
