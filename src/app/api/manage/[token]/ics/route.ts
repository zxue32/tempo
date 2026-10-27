import { byToken, bookingIcs } from '@/lib/bookings'
import { manageUrl } from '@/lib/email'

export async function GET(_req: Request, ctx: RouteContext<'/api/manage/[token]/ics'>) {
  const { token } = await ctx.params
  const found = await byToken(token)
  if (!found) return new Response('Not found', { status: 404 })
  const active = found.group.filter(b => b.status === 'confirmed' || b.status === 'completed')
  const ics = bookingIcs(found.shop, active.length ? active : found.group, found.primary.lang, manageUrl(token))
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="booking-${found.primary.code}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
