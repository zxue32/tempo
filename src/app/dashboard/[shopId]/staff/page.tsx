import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff, listServices, listSkills } from '@/lib/data/catalog'
import { sql } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { StaffEditor } from './StaffEditor'

export default async function StaffPage(props: PageProps<'/dashboard/[shopId]/staff'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const [staff, services, skills, members, invites] = await Promise.all([
    listStaff(shopId),
    listServices(shopId),
    listSkills(shopId),
    sql<{ userId: string; email: string; role: string; staffId: string | null }[]>`
      select m.user_id, u.email, m.role, m.staff_id from app.shop_members m join app.users u on u.id = m.user_id where m.shop_id = ${shopId}`,
    sql<{ email: string; staffId: string | null }[]>`select email, staff_id from app.member_invites where shop_id = ${shopId} and accepted_at is null`,
  ])
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('sf.title')}</h1>
      <StaffEditor shopId={shopId} industry={shop.industry} hours={shop.hours} staff={staff} services={services.filter(s => s.kind === 'service')} skills={skills} members={members} invites={invites} />
    </div>
  )
}
