import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff, listServices, listSkills } from '@/lib/data/catalog'
import { shiftsInRange, listSpecialDays, hoursOn } from '@/lib/data/schedule'
import { dayBookings } from '@/lib/bookings'
import { nowInZone, isDateString, fmtDate, fmtTime } from '@/lib/tz'
import { pendingReviews } from '@/lib/data/forms'
import { getT } from '@/lib/i18n/server'
import Link from 'next/link'
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
  const reviews = await pendingReviews(shopId)
  const { t, lang } = await getT()
  return (
    <>
    {reviews.length > 0 && (
      <div data-reviews className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-[13.5px]" role="status">
        <b>{t('rv.pendingCount', reviews.length)}</b>
        {reviews.slice(0, 5).map(r => (
          <Link key={r.bookingId} href={`/dashboard/${shopId}?date=${r.date}&open=${r.bookingId}`} className="font-semibold text-accent">
            {fmtDate(r.date, lang)} {fmtTime(r.startMin, lang)}{r.guestName ? ` · ${r.guestName}` : ''}
          </Link>
        ))}
      </div>
    )}
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
    </>
  )
}
