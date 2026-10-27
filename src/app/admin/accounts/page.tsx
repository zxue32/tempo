import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { AccountRow } from './AccountRow'

export default async function AccountsPage(props: PageProps<'/admin/accounts'>) {
  const me = await requireAdmin()
  const sp = await props.searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim().toLowerCase().slice(0, 80) : ''
  const { t, lang } = await getT()
  const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`
  const rows = await sql<{ id: string; email: string; createdAt: Date; lastSeenAt: Date | null; disabled: boolean; platformAdmin: boolean; shops: string | null; hasPassword: boolean }[]>`
    select u.id, u.email, u.created_at, u.last_seen_at, u.disabled, u.platform_admin, u.password_hash is not null as has_password,
      (select string_agg(s.name || ' (' || m.role || ')', ', ' order by s.name) from app.shop_members m join app.shops s on s.id = m.shop_id where m.user_id = u.id) as shops
    from app.users u
    ${q ? sql`where lower(u.email) like ${like}` : sql``}
    order by u.created_at desc limit 200
  `
  const df = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeZone: 'America/New_York' })
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('ac.title')}</h1>
        <p className="max-w-[70ch] text-muted">{t('ac.sub')}</p>
      </div>
      <form method="get" className="flex gap-2" role="search">
        <input name="q" type="search" className="inp max-w-sm" defaultValue={q} placeholder={t('c.email')} aria-label={t('c.search')} />
        <button className="btn btn-dark">{t('c.search')}</button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t('c.email')}</th><th>{t('ac.shops')}</th><th>{t('ac.joined')}</th><th>{t('ac.lastSeen')}</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={r.disabled ? 'opacity-60' : ''}>
                <td><b>{r.email}</b>{r.platformAdmin && <span className="chip chip-accent ml-2">{t('ac.admin')}</span>}{r.disabled && <span className="chip chip-bad ml-2">{t('ac.disabled')}</span>}</td>
                <td className="text-[13px]">{r.shops || '—'}</td>
                <td className="tnum whitespace-nowrap text-[13px]">{df.format(r.createdAt)}</td>
                <td className="tnum whitespace-nowrap text-[13px]">{r.lastSeenAt ? df.format(r.lastSeenAt) : '—'}</td>
                <td className="r"><AccountRow id={r.id} self={r.id === me.id} disabled={r.disabled} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
