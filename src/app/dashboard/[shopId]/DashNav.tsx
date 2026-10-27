'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import type { DictKey } from '@/lib/i18n'

export function DashNav({ shopId, role, slug }: { shopId: string; role: string; slug: string }) {
  const { t } = useI18n()
  const path = usePathname()
  const base = `/dashboard/${shopId}`
  const all: Array<[string, DictKey, boolean]> = [
    ['', 'd.today', true],
    ['/me', 'd.myDay', true],
    ['/bookings', 'd.bookings', false],
    ['/customers', 'd.customers', false],
    ['/schedule', 'd.schedule', false],
    ['/staff', 'd.staff', false],
    ['/services', 'd.services', false],
    ['/rules', 'd.rules', false],
    ['/gallery', 'd.gallery', false],
    ['/palette', 'd.palette', false],
    ['/reports', 'd.reports', false],
    ['/pilot', 'd.pilot', false],
    ['/share', 'd.share', false],
    ['/settings', 'd.settings', false],
  ]
  const items = all.filter(([, , staffOk]) => role !== 'staff' || staffOk)
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-3">
      {items.map(([href, key]) => {
        const full = base + href
        const active = href === '' ? path === base : path.startsWith(full)
        return (
          <Link key={href} href={full} aria-current={active ? 'page' : undefined}
            className={`flex-none rounded-lg px-3 py-2 text-[14px] font-semibold no-underline ${active ? 'bg-accent-soft text-accent-deep' : 'text-ink-2 hover:bg-bg'}`}>
            {t(key)}
          </Link>
        )
      })}
      <a href={`/${slug}`} target="_blank" rel="noreferrer" className="flex-none rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-2 no-underline lg:hidden">{t('d.viewStore')} ↗</a>
    </nav>
  )
}
