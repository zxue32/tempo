'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import type { DictKey } from '@/lib/i18n'

/** The client book's four pages: list, follow-ups, campaigns, add/import. */
export function CustomersNav({ shopId, badge }: { shopId: string; badge?: number }) {
  const { t } = useI18n()
  const path = usePathname()
  const base = `/dashboard/${shopId}/customers`
  const items: Array<[string, DictKey]> = [['', 'cu.tabs.list'], ['/followups', 'cu.tabs.followups'], ['/campaigns', 'cu.tabs.campaigns'], ['/new', 'cu.tabs.new']]
  return (
    <nav className="seg self-start" aria-label={t('cu.title')}>
      {items.map(([href, key]) => {
        const full = base + href
        const active = href === '' ? path === base || /\/customers\/[0-9a-f-]{36}$/.test(path) : path.startsWith(full)
        return (
          <Link key={href} href={full} aria-current={active ? 'page' : undefined} className="no-underline">
            {t(key)}{href === '/followups' && badge ? <span className="chip chip-accent ml-1.5 h-5 px-1.5 text-[11px]">{badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
