import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { shopHasHairTools, shopHasNailTools } from '@/lib/industries/shop'
import { listStaff } from '@/lib/data/catalog'
import { listPalette } from '@/lib/data/rules'
import { getCustomer } from '@/lib/data/insights'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { fmtDate, fmtTime, nowInZone } from '@/lib/tz'
import { BookingStatusChip, money } from '@/components/ui'
import { CustomerForm } from './CustomerForm'
import { PrefCard } from './PrefCard'

export default async function CustomerPage(props: PageProps<'/dashboard/[shopId]/customers/[customerId]'>) {
  const { shopId, customerId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const data = await getCustomer(shopId, customerId, today)
  if (!data) notFound()
  const { customer: c, history, recentDesigns } = data
  const staffList = await listStaff(shopId)
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
    ...(shop.showPrices ? [[t('cu.spent'), c.spentCents ? money(c.spentCents) : '—'] as [string, string]] : []),
  ]
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/dashboard/${shopId}/customers`} className="text-[14px] text-muted">← {t('cu.all')}</Link>
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{c.name}</h1>
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
          <PrefCard shopId={shopId} customerId={c.id} initial={c.preferences ?? {}} staff={staffList} nailColors={nailColors} hairColors={hairColors} tools={{ nail: shopHasNailTools(shop), hair: shopHasHairTools(shop) }} recentDesigns={recentDesigns} />
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold">{t('cu.history')}</h2>
          {history.length === 0 ? <div className="card p-6 text-muted">{t('bl.empty')}</div> : (
            <ul className="flex flex-col gap-2">
              {history.map(b => {
                const st = staff.get(b.staffId)
                return (
                  <li key={b.id}>
                    <Link href={`/dashboard/${shopId}?date=${b.date}&open=${b.id}`} className={`card flex flex-wrap items-center gap-3 p-3 text-ink no-underline ${b.status === 'cancelled' ? 'opacity-60' : ''}`}>
                      <span className="tnum w-28 flex-none text-[13.5px]"><b className="block">{fmtDate(b.date, lang, b.date.slice(0, 4) === today.slice(0, 4) ? { weekday: 'short', month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })}</b><span className="text-muted">{fmtTime(b.startMin, lang)}</span></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px]">{(b.items ?? []).map(i => (i.kind === 'addon' ? '+ ' : '') + pick(lang, i.name, i.nameZh)).join(', ')}</span>
                        <span className="block text-[12.5px] text-muted">
                          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: st?.color ?? '#999' }} />
                          {st ? pick(lang, st.name, st.nameZh) : '—'} · {t(`bk.${b.kind}`)}{b.cancelReason ? ` · ${b.cancelReason}` : ''}
                        </span>
                        {b.notes && <span className="block text-[12.5px] text-muted">“{b.notes}”</span>}
                      </span>
                      <span className="flex flex-col items-end gap-1"><BookingStatusChip status={b.status} t={t} />{shop.showPrices && <span className="tnum text-[13px]">{money(b.estPriceCents)}</span>}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
