'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { submitForReview } from './actions'
import type { DictKey } from '@/lib/i18n'

export function SubmitButton({ shopId, label, big }: { shopId: string; label: string; big?: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className={`btn btn-primary ${big ? '!min-h-[48px] !px-6' : 'btn-sm'}`} disabled={pending}
        onClick={() => start(async () => {
          const r = await submitForReview(shopId)
          if (!r.ok) { setMsg({ ok: false, text: t('c.error') }); return }
          if (r.issues.length) setMsg({ ok: false, text: t('set.cantSubmit'), list: r.issues.map(i => t(`set.missing.${i}` as DictKey)) })
          else setMsg({ ok: true, text: r.status === 'live' ? t('set.wentLive') : t('set.submitted') })
          router.refresh()
        })}>
        {pending ? '…' : label}
      </button>
      {msg && (
        <div role="status" className={`rounded-lg px-3 py-2 text-[13.5px] ${msg.ok ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
          {msg.text}
          {msg.list && <ul className="mt-1 list-disc pl-5">{msg.list.map(l => <li key={l}>{l}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}
