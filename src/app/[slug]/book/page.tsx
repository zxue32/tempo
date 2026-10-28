import { hasNailTools } from '@/lib/templates'
import { emailConfigured } from '@/lib/email'
import { loadStorefront } from '@/lib/storefront'
import { loadCatalog } from '@/lib/data/catalog'
import { makeT, pick } from '@/lib/i18n'
import { nowInZone } from '@/lib/tz'
import { StoreHeader, PreviewBanner } from '@/components/store'
import { BookingFlow, type FlowShop, type FlowInitial } from './BookingFlow'
import { sql } from '@/lib/db'
import { isDateString } from '@/lib/tz'
import { isNailDesign } from '@/components/NailArt'
import { listPalette } from '@/lib/data/rules'

export const metadata = { robots: { index: false } }

export default async function BookPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const { shop, preview, open, lang } = await loadStorefront(slug)
  const t = makeT(lang)
  if (!open) {
    return (
      <div className="min-h-screen">
        <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
        <main className="mx-auto max-w-xl px-4 py-16"><h1 className="s-display text-[34px]">{t('sf2.comingSoon')}</h1><p className="s-muted mt-2">{t('sf2.comingSoonD')}</p></main>
      </div>
    )
  }
  const catalog = await loadCatalog(shop.id, { forCustomers: true })
  const staff = catalog.staff.filter(s => s.active && s.bookableOnline)
  const flowShop: FlowShop = {
    slug: shop.slug, industry: shop.industry, maxGuests: shop.maxGuests, allowAnyStaff: shop.allowAnyStaff, maxDays: shop.maxDays,
    leadMinutes: shop.leadMinutes, cutoffMinutes: shop.cancelCutoffMinutes, showPrices: shop.showPrices, live: shop.status === 'live',
    note: pick(lang, shop.bookingNoteEn, shop.bookingNoteZh) || null, phone: shop.phone, waitlist: shop.waitlistEnabled,
  }
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const ids = (v: string | string[] | undefined) => one(v).split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 8)
  const lookId = ids(sp.look)[0]
  const [look] = lookId ? await sql<{ id: string; url: string }[]>`select id, url from app.gallery where id = ${lookId} and shop_id = ${shop.id}` : []
  const colorId = ids(sp.color)[0]
  const [hair] = colorId ? await sql<{ id: string; name: string; nameZh: string | null; code: string | null; hex: string }[]>`select id, name, name_zh, code, hex from app.palette where id = ${colorId} and shop_id = ${shop.id} and kind = 'hair'` : []
  let design = null
  try { const raw = one(sp.design); if (raw) { const j = JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); if (isNailDesign(j)) design = j } } catch { /* ignore a bad link */ }
  const initial: FlowInitial = {
    services: ids(sp.service), addons: ids(sp.addons), staff: ids(sp.staff)[0] ?? null,
    date: isDateString(one(sp.date)) ? one(sp.date) : null, look: look ?? null, design,
    hairColor: hair ? { id: hair.id, label: pick(lang, hair.name, hair.nameZh) + (hair.code ? ` ${hair.code}` : ''), hex: hair.hex } : null,
  }
  const nailColors = hasNailTools(shop.industry) ? await listPalette(shop.id, 'nail', true) : []
  return (
    <div className="min-h-screen">
      {preview && shop.status !== 'live' && <PreviewBanner text={t('sf2.previewBanner')} />}
      <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
      <BookingFlow
        shop={flowShop}
        emailOn={emailConfigured()}
        today={nowInZone(shop.timezone).date}
        services={catalog.services.map(s => ({ id: s.id, kind: s.kind, category: s.category, appliesTo: s.appliesTo, name: s.name, nameZh: s.nameZh, descEn: s.descEn, descZh: s.descZh, durationMin: s.durationMin, priceCents: s.priceCents, priceFrom: s.priceFrom, questionEn: s.questionEn, questionZh: s.questionZh }))}
        staff={staff.map(s => ({ id: s.id, name: s.name, nameZh: s.nameZh, bioEn: s.bioEn, bioZh: s.bioZh, color: s.color, photoUrl: s.photoUrl }))}
        skills={catalog.skills.filter(k => staff.some(s => s.id === k.staffId))}
        initial={initial}
        swatches={nailColors.map(c => ({ hex: c.hex, name: c.name, nameZh: c.nameZh, code: c.code }))}
      />
    </div>
  )
}
