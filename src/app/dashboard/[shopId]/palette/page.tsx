import { hasHairTools, hasNailTools } from '@/lib/templates'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listPalette, PALETTE_MAX } from '@/lib/data/rules'
import { getT } from '@/lib/i18n/server'
import { PaletteEditor } from './PaletteEditor'

export default async function PalettePage(props: PageProps<'/dashboard/[shopId]/palette'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const items = await listPalette(shopId)
  const kinds = [...(hasHairTools(shop.industry) ? ['hair'] : []), ...(hasNailTools(shop.industry) ? ['nail'] : [])] as Array<'hair' | 'nail'>
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('pl.title')}</h1>
        <p className="max-w-[70ch] text-muted">{t('pl.sub')}</p>
      </div>
      <PaletteEditor key={items.map(i => i.id + i.active).join()} shopId={shopId} kinds={kinds} items={items} max={PALETTE_MAX} />
    </div>
  )
}
