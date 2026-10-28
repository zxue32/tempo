import type { ShopStatus, BookingStatus } from '@/lib/types'
import type { T } from '@/lib/i18n'
import { env } from '@/lib/env'
import { formatMoney } from '@/lib/money'
import type { CurrencyCode } from '@/lib/markets'

export function PlatformMark({ size = 26, withName = true }: { size?: number; withName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
        <rect x="1" y="1" width="28" height="28" rx="9" fill="#16171B" />
        <path d="M15 7v8l5 3" stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="22" cy="8" r="2.6" fill="#7C8CFF" />
      </svg>
      {withName && <span className="font-display text-[19px] font-extrabold tracking-tight">{env.platformName}</span>}
    </span>
  )
}

export function ShopStatusChip({ status, t }: { status: ShopStatus; t: T }) {
  const cls = status === 'live' ? 'chip-ok' : status === 'pending' ? 'chip-accent' : status === 'changes' ? 'chip-warn' : status === 'draft' ? '' : 'chip-bad'
  return <span className={`chip ${cls}`}>{t(`st.${status}`)}</span>
}

export function BookingStatusChip({ status, t }: { status: BookingStatus; t: T }) {
  const cls = status === 'confirmed' ? 'chip-accent' : status === 'completed' ? 'chip-ok' : status === 'no_show' ? 'chip-warn' : 'chip-bad'
  return <span className={`chip ${cls}`}>{t(`bs.${status}`)}</span>
}

/** A price stored in minor units of the shop's currency (CORE-03). Same text in every interface language. */
export function money(minor: number | null | undefined, currency: CurrencyCode = 'USD'): string {
  if (minor == null) return ''
  return formatMoney(minor, currency)
}

export function Field({ label, hint, htmlFor, children, className = '' }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={'min-w-0 ' + className}>
      <label className="lbl" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}
