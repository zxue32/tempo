import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff } from '@/lib/data/catalog'
import { shiftsInRange } from '@/lib/data/schedule'
import { dayBookings } from '@/lib/bookings'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { addDays, fmtDate, fmtTime, isDateString, nowInZone } from '@/lib/tz'
import { PrintButton } from './PrintButton'

export default async function PrintSheet(props: PageProps<'/dashboard/[shopId]/print'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const today = nowInZone(shop.timezone).date
  const date = typeof sp.date === 'string' && isDateString(sp.date) ? sp.date : today
  const [staff, shifts, bookings] = await Promise.all([listStaff(shopId), shiftsInRange(shopId, date, date), dayBookings(shopId, date)])
  const active = bookings.filter(b => b.status !== 'cancelled')
  const people = staff.filter(s => active.some(b => b.staffId === s.id) || shifts.some(x => x.staffId === s.id))
  const base = `/dashboard/${shopId}/print`
  return (
    <div className="flex flex-col gap-4">
      <div className="print-hide flex flex-wrap items-center gap-2">
        <Link href={`${base}?date=${addDays(date, -1)}`} className="btn btn-sm">‹</Link>
        <input type="date" className="inp inp-sm tnum !w-auto" defaultValue={date} form="pdate" name="date" />
        <form id="pdate" method="get"><button className="btn btn-sm">{t('rp.show')}</button></form>
        <Link href={`${base}?date=${addDays(date, 1)}`} className="btn btn-sm">›</Link>
        <span className="flex-1" />
        <PrintButton label={t('pr.print')} />
      </div>
      <div className="print-area flex flex-col gap-4 bg-white text-black">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black pb-2">
          <h1 className="text-[22px] font-extrabold">{pick(lang, shop.name, shop.nameZh)} · {fmtDate(date, lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h1>
          <span className="text-[12px]">{t('pr.count', active.filter(b => b.kind !== 'block').length)} · {t('pr.printed', new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, dateStyle: 'short', timeStyle: 'short' }))}</span>
        </div>
        <p className="text-[12px]">{t('pr.how')}</p>
        {people.length === 0 && <p>{t('me.empty')}</p>}
        {people.map(p => {
          const sh = shifts.find(x => x.staffId === p.id)
          const list = active.filter(b => b.staffId === p.id).sort((a, b) => a.startMin - b.startMin)
          return (
            <section key={p.id} className="break-inside-avoid">
              <h2 className="mb-1 text-[15px] font-bold">{pick(lang, p.name, p.nameZh)} <span className="font-normal">· {sh ? `${fmtTime(sh.startMin, lang)}–${fmtTime(sh.endMin, lang)}` : t('me.off')}</span></h2>
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-left">
                    {[t('c.time'), t('bl.colGuest'), t('bl.colServices'), t('bl.colSource'), t('pr.arrived'), t('pr.onPaper'), t('c.notes')].map(h => <th key={h} className="border border-black px-1.5 py-1">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={7} className="border border-black px-1.5 py-2">—</td></tr>}
                  {list.map(b => (
                    <tr key={b.id}>
                      <td className="tnum whitespace-nowrap border border-black px-1.5 py-1.5">{fmtTime(b.startMin, lang)}–{fmtTime(b.endMin, lang)}</td>
                      <td className="border border-black px-1.5 py-1.5">{b.kind === 'block' ? (b.notes || t('bk.block')) : <>{b.guestName}<br /><span className="tnum">{b.guestPhone ?? ''}</span></>}</td>
                      <td className="border border-black px-1.5 py-1.5">{(b.items ?? []).map(i => (i.kind === 'addon' ? '+' : '') + pick(lang, i.name, i.nameZh)).join(', ')}</td>
                      <td className="border border-black px-1.5 py-1.5">{t(`bk.${b.kind}`)}{b.clientConfirmedAt ? ' ☑' : ''}{b.status === 'completed' ? ' ✓' : b.status === 'no_show' ? ' ✕' : ''}</td>
                      <td className="w-20 border border-black px-1.5 py-1.5" />
                      <td className="w-16 border border-black px-1.5 py-1.5 text-center">□</td>
                      <td className="w-40 border border-black px-1.5 py-1.5" />
                    </tr>
                  ))}
                  {[0, 1].map(i => <tr key={'x' + i}>{Array.from({ length: 7 }, (_, j) => <td key={j} className="h-7 border border-black" />)}</tr>)}
                </tbody>
              </table>
            </section>
          )
        })}
        <div className="mt-2 flex gap-10 text-[13px]"><span>{t('pr.diffs')} ______</span><span>{t('pr.checkedBy')} ______</span></div>
      </div>
    </div>
  )
}
