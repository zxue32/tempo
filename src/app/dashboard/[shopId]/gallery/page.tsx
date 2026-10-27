import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listServices, listStaff } from '@/lib/data/catalog'
import { listGallery, listPalette, GALLERY_MAX } from '@/lib/data/rules'
import { tagsFor } from '@/lib/tags'
import { getT } from '@/lib/i18n/server'
import { GalleryEditor } from './GalleryEditor'

export default async function GalleryPage(props: PageProps<'/dashboard/[shopId]/gallery'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const [items, staff, services, palette] = await Promise.all([listGallery(shopId), listStaff(shopId, { activeOnly: true }), listServices(shopId, { activeOnly: true }), listPalette(shopId)])
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('ga.title')}</h1>
          <p className="max-w-[70ch] text-muted">{t('ga.sub')}</p>
        </div>
        <a href={`/${shop.slug}/gallery`} target="_blank" rel="noreferrer" className="btn btn-sm">{t('ga.view')} ↗</a>
      </div>
      <GalleryEditor
        key={items.map(i => i.id).join()}
        shopId={shopId}
        max={GALLERY_MAX}
        items={items.map(i => ({ id: i.id, url: i.url, captionEn: i.captionEn ?? '', captionZh: i.captionZh ?? '', staffId: i.staffId ?? '', serviceId: i.serviceId ?? '', tags: i.tags ?? {} }))}
        styleTags={tagsFor(shop.industry)}
        colors={palette.map(c => ({ id: c.id, name: c.name, nameZh: c.nameZh }))}
        staff={staff.map(s => ({ id: s.id, name: s.name, nameZh: s.nameZh }))}
        services={services.filter(s => s.kind === 'service').map(s => ({ id: s.id, name: s.name, nameZh: s.nameZh }))}
      />
    </div>
  )
}
