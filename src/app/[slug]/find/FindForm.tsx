'use client'
import { useActionState } from 'react'
import { useI18n } from '@/components/i18n'
import { findBookingAction, type FindState } from './actions'

export function FindForm({ slug, defaultCode }: { slug: string; defaultCode: string }) {
  const { t } = useI18n()
  const [state, action, pending] = useActionState<FindState, FormData>(findBookingAction.bind(null, slug), null)
  return (
    <form className="flex flex-col gap-4" action={action}>
      <div><label className="s-lbl" htmlFor="f-code">{t('mg.code')}</label><input id="f-code" name="code" className="s-inp uppercase tracking-widest" defaultValue={state?.code ?? defaultCode} autoComplete="off" required maxLength={8} /></div>
      <div><label className="s-lbl" htmlFor="f-phone">{t('c.phone')}</label><input id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="s-inp" required maxLength={30} /></div>
      {state?.error && <p className="text-[14px] font-semibold" style={{ color: '#C2362B' }} role="alert">{state.error === 'rate' ? t('bf.err.rate') : t('mg.notFound')}</p>}
      <button className="s-btn" disabled={pending}>{pending ? '…' : t('mg.find')}</button>
    </form>
  )
}
