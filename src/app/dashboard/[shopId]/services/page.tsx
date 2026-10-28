import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listServices } from '@/lib/data/catalog'
import { getT } from '@/lib/i18n/server'
import { CATEGORIES } from '@/lib/templates'
import { ServicesEditor } from './ServicesEditor'
import { listResources } from '@/lib/data/rules'
import Link from 'next/link'

export default async function ServicesPage(props: PageProps<'/dashboard/[shopId]/services'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const [services, resources] = await Promise.all([listServices(shopId), listResources(shopId)])
  const used = new Set(services.filter(s => s.kind === 'service').map(s => s.category))
  const cats = Array.from(new Set([...CATEGORIES[shop.industry], ...used]))
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('sv.title')}</h1>
        <p className="text-[14px] text-muted">{t('sv.hint')}</p>
        {resources.length === 0 && <p className="mt-1 text-[13px] text-muted">{t('sv.resourceTip')} <Link href={`/dashboard/${shopId}/rules`}>{t('sv.resourceTipLink')}</Link></p>}
      </div>
      <ServicesEditor shopId={shopId} currency={shop.currency} services={services} categories={cats} resources={resources.map(r => ({ id: r.id, name: r.name, nameZh: r.nameZh, quantity: r.quantity }))} />
    </div>
  )
}
