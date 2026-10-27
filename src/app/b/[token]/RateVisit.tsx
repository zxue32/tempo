'use client'
import { useState } from 'react'
import { useI18n } from '@/components/i18n'

/** Five big stars after the visit; one rating per booking. */
export function RateVisit({ token, staffName, rated }: { token: string; staffName: string; rated: number | null }) {
  const { t } = useI18n()
  const [stars, setStars] = useState(rated ?? 0)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(rated != null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  if (done) return <p className="s-card px-4 py-3 text-[14px] font-semibold" role="status"><span aria-hidden="true" style={{ color: 'var(--s-accent)' }}>{'★'.repeat(stars)}</span> {t('rt.thanks')}</p>
  return (
    <div className="s-card flex flex-col gap-3 p-4">
      <b className="text-[15px]">{t('rt.ask', staffName)}</b>
      <div className="flex gap-1" role="radiogroup" aria-label={t('tp.rating')}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={t('rt.star', n)} onClick={() => setStars(n)}
            className="grid h-12 w-12 place-items-center rounded-full text-[30px] leading-none" style={{ color: n <= stars ? 'var(--s-accent)' : 'var(--s-line)' }}>★</button>
        ))}
      </div>
      {stars > 0 && <textarea className="s-inp" rows={2} placeholder={t('rt.note')} value={note} maxLength={300} onChange={e => setNote(e.target.value)} />}
      <button type="button" className="s-btn self-start" disabled={!stars || busy} onClick={async () => {
        setBusy(true); setErr(false)
        const r = await fetch(`/api/manage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rate', rating: stars, note }) }).catch(() => null)
        setBusy(false)
        if (r?.ok) setDone(true); else setErr(true)
      }}>{busy ? '…' : t('rt.send')}</button>
      {err && <span className="text-[13px] font-semibold" style={{ color: '#C2362B' }}>{t('c.error')}</span>}
    </div>
  )
}
