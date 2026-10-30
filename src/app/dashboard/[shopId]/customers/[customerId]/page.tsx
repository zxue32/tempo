import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { shopHasHairTools, shopHasNailTools } from '@/lib/industries/shop'
import { listStaff } from '@/lib/data/catalog'
import { listPalette } from '@/lib/data/rules'
import { getCustomer } from '@/lib/data/insights'
import { timeline, customerTags, segmentOf, type CustomerRow } from '@/lib/data/crm'
import { sql } from '@/lib/db'
import type { DictKey } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { fmtDate, fmtTime, nowInZone } from '@/lib/tz'
import { money } from '@/components/ui'
import { CustomerForm } from './CustomerForm'
import { PrefCard } from './PrefCard'
import { CrmCard } from './CrmCard'
import { Timeline } from './Timeline'
import { CustomersNav } from '../CustomersNav'
import { SEG_CHIP } from '../segments'

export default async function CustomerPage(props: PageProps<'/dashboard/[shopId]/customers/[customerId]'>) {
  const { shopId, customerId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const data = await getCustomer(shopId, customerId, today)
  if (!data) notFound()
  const { customer, recentDesigns } = data
  const c = customer as CustomerRow
  const [entries, tags, [open], staffList] = await Promise.all([
    timeline(shopId, customerId),
    customerTags(shopId),
    sql<{ due: string; reason: string }[]>`select due::text, reason from app.follow_ups where shop_id = ${shopId} and customer_id = ${customerId} and status = 'open' order by due limit 1`,
    listStaff(shopId),
  ])
  const seg = segmentOf(c, today, shop.rebookDays)
  const staff = new Map(staffList.map(s => [s.id, s]))
  const palette = await listPalette(shopId, undefined, true)
  const nailColors = palette.filter(p => p.kind === 'nail').map(p => ({ hex: p.hex, name: p.name, nameZh: p.nameZh }))
  const hairColors = palette.filter(p => p.kind === 'hair').map(p => ({ id: p.id, label: [p.code, p.name].filter(Boolean).join(' · '), display: [p.code, pick(lang, p.name, p.nameZh)].filter(Boolean).join(' · '), hex: p.hex, hex2: p.hex2 }))
  const kpis: Array<[string, string | number, string?]> = [
    [t('cu.visits'), c.visits],
    [t('cu.noShows'), c.noShows, c.noShows ? 'text-warn' : undefined],
    [t('cu.cancels'), c.cancels],
    [t('cu.last'), c.lastVisit ? fmtDate(c.lastVisit, lang) : '—'],
    [t('cu.next'), c.nextVisit ? fmtDate(c.nextVisit, lang) : '—'],
    ...(shop.showPrices ? [[t('cu.spent'), c.spentCents ? money(c.spentCents, shop.currency) : '—'] as [string, string]] : []),
  ]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/${shopId}/customers`} className="text-[14px] text-muted">← {t('cu.all')}</Link>
        <CustomersNav shopId={shopId} />
      </div>
      <div>
        <h1 className="font-display flex flex-wrap items-center gap-2 text-[28px] font-extrabold tracking-tight">{c.name}{seg !== 'new' && <span className={`chip ${SEG_CHIP[seg] ?? ''}`}>{t(`cu.seg.${seg}` as DictKey)}</span>}</h1>
        <p className="text-[14px] text-muted">{t('cu.since', fmtDate(c.createdAt.toISOString().slice(0, 10), lang, { year: 'numeric', month: 'short', day: 'numeric' }))}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([k, v, cls]) => (
          <div key={k} className="card p-3"><dt className="text-[12.5px] text-muted">{k}</dt><dd className={`tnum text-[20px] font-bold ${cls ?? ''}`}>{v}</dd></div>
        ))}
      </dl>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-[17px] font-bold">{t('cu.details')}</h2>
            <CustomerForm shopId={shopId} customer={{ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '', blocked: c.blocked }} />
          </section>
          <CrmCard shopId={shopId} customerId={c.id} suggestions={tags.map(x => x.tag)}
            initial={{ tags: c.tags, birthday: c.birthday, source: c.source, marketingConsent: c.marketingConsent, marketingConsentAt: c.marketingConsentAt ? new Date(c.marketingConsentAt).toISOString() : null, lastContactedAt: c.lastContactedAt ? new Date(c.lastContactedAt).toISOString() : null }} />
          <PrefCard shopId={shopId} customerId={c.id} initial={c.preferences ?? {}} staff={staffList} nailColors={nailColors} hairColors={hairColors} tools={{ nail: shopHasNailTools(shop), hair: shopHasHairTools(shop) }} recentDesigns={recentDesigns} />
        </div>
        <Timeline shopId={shopId} customerId={c.id} today={today} showPrices={shop.showPrices} currency={shop.currency} rebookDays={shop.rebookDays}
          staffNames={Object.fromEntries(staffList.map(s => [s.id, pick(lang, s.name, s.nameZh)]))}
          openFollowUp={open ?? null}
          entries={entries.map(e => ({ ...e, at: e.at.toISOString() }))} />
      </div>
    </div>
  )
}
