'use client'
import { useState } from 'react'
import { useI18n } from '@/components/i18n'

/** "Yes, I'll be there". A button (not a link) so email scanners can't confirm by opening the page. */
export function ConfirmAttendance({ token, confirmed, highlight }: { token: string; confirmed: boolean; highlight: boolean }) {
  const { t } = useI18n()
  const [done, setDone] = useState(confirmed)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  if (done) return <p className="s-card px-4 py-3 text-[14px] font-semibold" role="status">✓ {t('mg.confirmed')}</p>
  return (
    <div className={`s-card flex flex-wrap items-center gap-3 p-4 ${highlight ? 'ring-2' : ''}`} style={highlight ? { '--tw-ring-color': 'var(--s-accent)' } as React.CSSProperties : undefined}>
      <span className="min-w-0 flex-1 text-[14px]">{t('mg.confirmAsk')}</span>
      <button type="button" className="s-btn" disabled={busy} onClick={async () => {
        setBusy(true); setErr(false)
        const r = await fetch(`/api/manage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }) }).catch(() => null)
        setBusy(false)
        if (r?.ok) setDone(true); else setErr(true)
      }}>{busy ? '…' : t('em.confirmBtn')}</button>
      {err && <span className="w-full text-[13px] font-semibold" style={{ color: '#C2362B' }}>{t('c.error')}</span>}
    </div>
  )
}
