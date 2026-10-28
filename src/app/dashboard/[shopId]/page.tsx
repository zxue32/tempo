import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff, listServices, listSkills } from '@/lib/data/catalog'
import { shiftsInRange, listSpecialDays, hoursOn } from '@/lib/data/schedule'
import { dayBookings } from '@/lib/bookings'
import { nowInZone, isDateString } from '@/lib/tz'
import { Calendar } from './Calendar'
import { redirect } from 'next/navigation'

export default async function CalendarPage(props: PageProps<'/dashboard/[shopId]'>) {
  const { shopId } = await props.params
  const sp = await props.searchParams
  const { member } = await requireShop(shopId, 'staff')
  if (member.role === 'staff') redirect(`/dashboard/${shopId}/me`)
  const shop = (await getShop(shopId))!
  const now = nowInZone(shop.timezone)
  const date = typeof sp.date === 'string' && isDateString(sp.date) ? sp.date : now.date
  const [staff, services, skills, shifts, bookings, specials] = await Promise.all([
    listStaff(shopId),
    listServices(shopId),
    listSkills(shopId),
    shiftsInRange(shopId, date, date),
    dayBookings(shopId, date),
    listSpecialDays(shopId, date),
  ])
  const hours = hoursOn(shop.hours, new Map(specials.filter(s => s.date === date).map(s => [s.date, s])), date)
  return (
    <Calendar
      key={date}
      shop={{ id: shop.id, industry: shop.industry, currency: shop.currency, slotMinutes: shop.slotMinutes, bufferMinutes: shop.bufferMinutes, maxGuests: shop.maxGuests, timezone: shop.timezone }}
      date={date}
      today={now.date}
      nowMin={now.min}
      hours={hours}
      staff={staff}
      services={services}
      skills={skills}
      shifts={shifts}
      bookings={bookings}
      openId={typeof sp.open === 'string' ? sp.open : null}
    />
  )
}
