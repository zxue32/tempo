import Link from 'next/link'
import { LangToggle } from '@/components/i18n'
import { env } from '@/lib/env'
import { SceneCanvas } from '@/components/landing/SceneCanvas'
import '@fontsource-variable/noto-serif-sc'
import '@/styles/ds.css'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ds-root">
      <div className="ds-mesh" aria-hidden="true" />
      <SceneCanvas trade="nail" stage="field" poster="/landing/poster-field.jpg" />
      <div className="ds-grain" aria-hidden="true" />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))' }}>
        <Link href="/" className="flex items-center gap-2 text-[19px] font-bold tracking-tight no-underline" style={{ color: 'var(--ds-ink)' }}>
          <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="#F4F1F8" /><path d="M15 7v8l5 3" stroke="#0B0A14" strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="22" cy="8" r="2.6" fill="#8C9BFF" /></svg>
          {env.platformName}
        </Link>
        <LangToggle className="ds-btn ds-btn-ghost ds-btn-sm" />
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-6 sm:pt-12">{children}</main>
    </div>
  )
}
