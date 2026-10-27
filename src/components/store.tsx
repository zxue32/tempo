import Link from 'next/link'
import type { Shop, Lang } from '@/lib/types'
import { pick } from '@/lib/i18n'
import { LangToggle } from './i18n'

export function StoreHeader({ shop, lang, back }: { shop: Shop; lang: Lang; back?: { href: string; label: string } }) {
  const name = pick(lang, shop.name, shop.nameZh)
  return (
    <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
      {back ? (
        <Link href={back.href} aria-label={back.label} className="grid h-11 w-11 flex-none place-items-center rounded-full border s-line" style={{ background: 'var(--s-surface)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </Link>
      ) : shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shop.logoUrl} alt="" className="h-11 w-11 flex-none rounded-full object-cover" />
      ) : null}
      <Link href={`/${shop.slug}`} className="s-display min-w-0 truncate text-[19px] no-underline" style={{ color: 'var(--s-ink)' }}>{name}</Link>
      <span className="flex-1" />
      <LangToggle className="s-btn s-btn-ghost s-btn-sm" />
    </header>
  )
}

export function PreviewBanner({ text }: { text: string }) {
  return <div className="px-4 py-2 text-center text-[13px] font-semibold" style={{ background: 'var(--s-soft)', color: 'var(--s-ink)' }}>{text}</div>
}

export function Initial({ name, color, size = 56, photo }: { name: string; color: string; size?: number; photo?: string | null }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="flex-none rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span className="s-display grid flex-none place-items-center rounded-full text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
