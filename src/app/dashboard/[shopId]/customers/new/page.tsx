import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { openFollowUps } from '@/lib/data/crm'
import { getT } from '@/lib/i18n/server'
import { nowInZone } from '@/lib/tz'
import { CustomersNav } from '../CustomersNav'
import { NewClient } from './NewClient'

export default async function NewClientPage(props: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const due = await openFollowUps(shopId, nowInZone(shop.timezone).date)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('cu.tabs.new')}</h1>
        <CustomersNav shopId={shopId} badge={due.length} />
      </div>
      <NewClient shopId={shopId} />
    </div>
  )
}
