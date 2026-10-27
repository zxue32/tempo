import { pick } from './i18n'

import type { GalleryTags } from './types'
export type Look = { id: string; url: string; caption: string | null; staffId: string | null; staffName: string | null; serviceId: string | null; serviceName: string | null; tags: GalleryTags }

/** Gallery rows → what the public page shows (only bookable staff and live services are linked). */
export function looksFrom(
  items: Array<{ id: string; url: string; captionEn: string | null; captionZh: string | null; staffId: string | null; serviceId: string | null; tags?: GalleryTags }>,
  staff: Array<{ id: string; name: string; nameZh: string | null; bookableOnline: boolean; active: boolean }>,
  services: Array<{ id: string; name: string; nameZh: string | null }>,
  lang: 'zh' | 'en',
): Look[] {
  return items.map(i => {
    const st = staff.find(s => s.id === i.staffId && s.active && s.bookableOnline)
    const sv = services.find(s => s.id === i.serviceId)
    return {
      id: i.id, url: i.url, caption: pick(lang, i.captionEn, i.captionZh) || null,
      staffId: st?.id ?? null, staffName: st ? pick(lang, st.name, st.nameZh) : null,
      serviceId: sv?.id ?? null, serviceName: sv ? pick(lang, sv.name, sv.nameZh) : null, tags: i.tags ?? {},
    }
  })
}
