import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { suggestFollowUps, openFollowUps } from '@/lib/data/crm'
import { getT } from '@/lib/i18n/server'
import { nowInZone } from '@/lib/tz'
import { CustomersNav } from '../CustomersNav'
import { FollowUps } from './FollowUps'

export default async function FollowUpsPage(props: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const today = nowInZone(shop.timezone).date
  const [due, suggestions] = await Promise.all([openFollowUps(shopId, today), suggestFollowUps(shopId, today)])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('cu.fu.title')}</h1>
        <CustomersNav shopId={shopId} badge={due.length} />
      </div>
      <FollowUps shopId={shopId} today={today} due={due} suggestions={suggestions} rebookDays={shop.rebookDays} />
    </div>
  )
}
