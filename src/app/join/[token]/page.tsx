import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { getUser } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { PlatformMark } from '@/components/ui'
import { acceptInviteAction } from './actions'

export const metadata = { robots: { index: false } }

export default async function JoinPage(props: PageProps<'/join/[token]'>) {
  const { token } = await props.params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound()
  const { t, lang } = await getT()
  const [inv] = await sql<{ shopId: string; shopName: string; shopNameZh: string | null; staffName: string | null; role: string; acceptedAt: Date | null }[]>`
    select i.shop_id, s.name as shop_name, s.name_zh as shop_name_zh, st.name as staff_name, i.role, i.accepted_at
    from app.member_invites i join app.shops s on s.id = i.shop_id left join app.staff st on st.id = i.staff_id
    where i.token = ${token}
  `
  const user = await getUser()
  const next = `/join/${token}`
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-5xl px-4 py-3"><Link href="/" className="text-ink no-underline"><PlatformMark /></Link></header>
      <main className="mx-auto max-w-md px-4 pt-10">
        <div className="card flex flex-col gap-4 p-6 sm:p-8">
          {!inv || inv.acceptedAt ? (
            <>
              <h1 className="font-display text-[26px] font-extrabold">{t('jn.used')}</h1>
              <p className="text-muted">{t('jn.usedD')}</p>
              <Link href="/dashboard" className="btn self-start">{t('home.dashboard')}</Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-[26px] font-extrabold">{t('jn.title', pick(lang, inv.shopName, inv.shopNameZh))}</h1>
              <p className="text-muted">{t('jn.sub', inv.staffName ?? '', t(inv.role === 'manager' ? 'jn.roleManager' : 'jn.roleStaff'))}</p>
              {user ? (
                <form action={acceptInviteAction.bind(null, token)} className="flex flex-col gap-3">
                  <p className="text-[14px]">{t('jn.as', user.email)}</p>
                  <button className="btn btn-primary">{t('jn.accept')}</button>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-primary">{t('jn.signup')}</Link>
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn">{t('jn.login')}</Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
