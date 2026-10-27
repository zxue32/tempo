'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { errText } from '@/components/dash'
import { setBookingStatusAction, markStartedAction } from '../actions'

export function MeActions({ shopId, bookingId, started }: { shopId: string; bookingId: string; started: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const set = (status: 'completed' | 'no_show') => start(async () => {
    setErr(null)
    const r = await setBookingStatusAction(shopId, bookingId, status)
    if (!r.ok) setErr(errText(t, r.error, r.detail)); else router.refresh()
  })
  const begin = () => start(async () => {
    setErr(null)
    const r = await markStartedAction(shopId, bookingId)
    if (!r.ok) setErr(errText(t, r.error, r.detail)); else router.refresh()
  })
  return (
    <>
      {!started && <button className="btn btn-sm btn-dark" disabled={pending} onClick={begin}>▶ {t('cal.start')}</button>}
      <button className={`btn btn-sm ${started ? 'btn-dark' : ''}`} disabled={pending} onClick={() => set('completed')}>✓ {t('cal.markDone')}</button>
      <button className="btn btn-sm" disabled={pending} onClick={() => set('no_show')}>{t('cal.markNoShow')}</button>
      {err && <span className="err">{err}</span>}
    </>
  )
}
