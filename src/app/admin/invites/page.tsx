import { requireAdmin } from '@/lib/auth'
import { listInvites } from '@/lib/data/shops'
import { getT } from '@/lib/i18n/server'
import { env } from '@/lib/env'
import { CopyButton } from '@/components/dash'
import { InviteForm, DeleteInvite } from './InviteForm'

export default async function InvitesPage() {
  await requireAdmin()
  const { t, lang } = await getT()
  const invites = await listInvites()
  const now = Date.now()
  const df = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' })
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('ad.invites')}</h1>
        <p className="text-muted">{t('ad.inviteHint')}</p>
      </div>
      <InviteForm />
      {invites.length === 0 ? <div className="card p-8 text-center text-muted">{t('ad.noInvites')}</div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t('ad.code')}</th><th>{t('ad.inviteNote')}</th><th>{t('c.status')}</th><th>{t('ad.inviteLink')}</th><th /></tr></thead>
            <tbody>
              {invites.map(i => {
                const url = `${env.siteUrl}/signup?invite=${encodeURIComponent(i.code)}`
                const expired = !!i.expiresAt && i.expiresAt.getTime() < now
                const usedUp = i.uses >= i.maxUses
                return (
                  <tr key={i.code} className={expired || usedUp ? 'opacity-60' : ''}>
                    <td className="tnum font-bold">{i.code}</td>
                    <td className="text-[13.5px]">{i.note || '—'}</td>
                    <td className="whitespace-nowrap text-[13px]">
                      {t('ad.uses', i.uses, i.maxUses)}
                      {i.expiresAt && <span className="block text-muted">{expired ? t('ad.expired') : `→ ${df.format(i.expiresAt)}`}</span>}
                      {usedUp && <span className="chip ml-1">{t('ad.usedUp')}</span>}
                    </td>
                    <td><div className="flex items-center gap-2"><code className="max-w-[260px] truncate text-[12px] text-muted">{url.replace(/^https?:\/\//, '')}</code><CopyButton text={url} /></div></td>
                    <td className="r"><DeleteInvite code={i.code} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
