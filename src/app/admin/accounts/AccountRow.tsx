'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { CopyButton } from '@/components/dash'
import { resetLinkAction, setDisabledAction } from '../actions'

export function AccountRow({ id, self, disabled }: { id: string; self: boolean; disabled: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const [link, setLink] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
        <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await resetLinkAction(id); if (r.ok) setLink(r.link) })}>{t('ac.resetLink')}</button>
        {!self && <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => start(async () => { await setDisabledAction(id, !disabled); router.refresh() })}>{disabled ? t('ac.enable') : t('ac.disable')}</button>}
      </div>
      {link && (
        <div className="flex max-w-[420px] items-center gap-2 rounded-lg border border-line bg-bg p-2 text-left">
          <code className="min-w-0 flex-1 truncate text-[12px]">{link}</code>
          <CopyButton text={link} />
        </div>
      )}
      {link && <span className="text-[12px] text-muted">{t('ac.resetLinkHint')}</span>}
    </div>
  )
}
