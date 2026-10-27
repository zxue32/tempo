import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff } from '@/lib/data/catalog'
import { shiftsInRange, listSpecialDays } from '@/lib/data/schedule'
import { mondayOf, addDays, nowInZone, isDateString } from '@/lib/tz'
import { getT } from '@/lib/i18n/server'
import { WeekEditor } from './WeekEditor'
import { SpecialDays } from './SpecialDays'

export default async function SchedulePage(props: PageProps<'/dashboard/[shopId]/schedule'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const today = nowInZone(shop.timezone).date
  const week = typeof sp.week === 'string' && isDateString(sp.week) ? mondayOf(sp.week) : mondayOf(today)
  const [staff, shifts, prev, specials] = await Promise.all([
    listStaff(shopId, { activeOnly: true }),
    shiftsInRange(shopId, week, addDays(week, 6)),
    shiftsInRange(shopId, addDays(week, -7), addDays(week, -1)),
    listSpecialDays(shopId, addDays(today, -1)),
  ])
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('sc.title')}</h1>
        <p className="text-[14px] text-muted">{t('sc.hint')}</p>
      </div>
      <WeekEditor key={week} shopId={shopId} week={week} today={today} hours={shop.hours} staff={staff} shifts={shifts} prevShifts={prev}
        specials={specials.filter(s => s.date >= week && s.date <= addDays(week, 6))} />
      <SpecialDays shopId={shopId} today={today} specials={specials} />
    </div>
  )
}
