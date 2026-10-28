import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listServices, listStaff } from '@/lib/data/catalog'
import { listResources } from '@/lib/data/rules'
import { getT } from '@/lib/i18n/server'
import { RulesEditor } from './RulesEditor'
import { IntakeEditor } from './IntakeEditor'
import { latestForms } from '@/lib/data/forms'
import { shopIndustries } from '@/lib/industries/shop'
import type { DictKey } from '@/lib/i18n'

export default async function RulesPage(props: PageProps<'/dashboard/[shopId]/rules'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const [resources, services, staff, forms] = await Promise.all([listResources(shopId), listServices(shopId, { activeOnly: true }), listStaff(shopId, { activeOnly: true }), latestForms(shopId)])
  const industries = shopIndustries(shop)
  const main = services.filter(s => s.kind === 'service')
  const shortest = main.length ? Math.min(...main.map(s => s.durationMin)) : 30
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('ru.title')}</h1>
        <p className="text-muted">{t('ru.sub')}</p>
      </div>
      {industries.map(ind => {
        const f = forms.find(x => x.industry === ind)
        const addons = services.filter(s => s.kind === 'addon' && s.industry === ind).map(s => ({ id: s.id, name: s.name }))
        return (
          <IntakeEditor key={`${ind}:${f?.version ?? 0}`} shopId={shopId} industry={ind} industryLabel={t(`ind.${ind}` as DictKey)}
            latest={f ? { industry: f.industry, version: f.version, active: f.active, schema: f.schema } : null}
            addons={addons} removalGuess={addons.find(a => /remov|卸/i.test(a.name))?.id ?? null} />
        )
      })}
      <RulesEditor
        shopId={shopId}
        industry={shop.industry}
        staffCount={staff.length}
        shortest={shortest}
        resources={resources.map(r => ({ id: r.id, name: r.name, nameZh: r.nameZh ?? '', quantity: r.quantity, used: services.filter(s => s.resourceId === r.id).map(s => s.name) }))}
        rules={{ walkinReserve: shop.walkinReserve, assignMode: shop.assignMode, turnsCountRequests: shop.turnsCountRequests, minGap: shop.minGap, noshowLimit: shop.noshowLimit, waitlistEnabled: shop.waitlistEnabled }}
      />
    </div>
  )
}
