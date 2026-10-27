import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { byToken, canCustomerChange } from '@/lib/bookings'
import { loadCatalog } from '@/lib/data/catalog'
import { makeT, pick, isLang } from '@/lib/i18n'
import { fmtDate, fmtTime, fmtDuration, nowInZone } from '@/lib/tz'
import { themeVars, themeOf } from '@/lib/themes'
import { I18nProvider } from '@/components/i18n'
import { StoreHeader, Initial } from '@/components/store'
import { money } from '@/components/ui'
import { ManageActions } from './ManageActions'
import { ConfirmAttendance } from './ConfirmAttendance'
import { env } from '@/lib/env'
import { emailConfigured } from '@/lib/email'

export const metadata = { title: 'Booking', robots: { index: false } }

const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export default async function ManagePage(props: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await props.params
  const sp = await props.searchParams
  const found = await byToken(token)
  if (!found) notFound()
  const { shop, group, primary } = found
  const c = (await cookies()).get('lang')?.value
  const lang = isLang(c) ? c : primary.lang
  const t = makeT(lang)
  const catalog = await loadCatalog(shop.id)
  const staffName = (id: string) => { const s = catalog.staff.find(x => x.id === id); return s ? pick(lang, s.name, s.nameZh) : '' }
  const active = group.filter(b => b.status === 'confirmed')
  const show = active.length ? active : group
  const first = show[0]
  const status = first.status
  const canChange = active.length > 0 && active.every(b => canCustomerChange(shop, b)) && shop.status === 'live'
  const cutoffAt = new Date(first.startsAt.getTime() - shop.cancelCutoffMinutes * 60000)
  const cutoffText = cutoffAt.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const end = Math.max(...show.map(b => b.endMin))
  const shopName = pick(lang, shop.name, shop.nameZh)
  const where = [shop.address, shop.city].filter(Boolean).join(', ')
  const mapHref = shop.mapUrl || (where ? `https://maps.google.com/?q=${encodeURIComponent(where)}` : null)
  const title = `${shopName} · ${show.flatMap(b => (b.items ?? []).map(i => pick(lang, i.name, i.nameZh))).join(', ')}`
  const manageUrl = `${env.siteUrl}/b/${token}`
  const gHref = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${gcal(first.startsAt)}/${gcal(new Date(Math.max(...show.map(b => b.endsAt.getTime()))))}&details=${encodeURIComponent(`${t('mg.code')}: ${first.code}\n${manageUrl}`)}&location=${encodeURIComponent(where)}`
  const isNew = sp.new === '1' && status === 'confirmed'

  // qualified staff for a single-guest reschedule
  const single = active.length === 1 ? active[0] : null
  const serviceIds = single ? (single.items ?? []).filter(i => i.kind === 'service').map(i => i.serviceId).filter((x): x is string => !!x) : []
  const choices = single
    ? catalog.staff.filter(s => s.active && s.bookableOnline && serviceIds.length > 0 && serviceIds.every(id => catalog.skills.some(k => k.staffId === s.id && k.serviceId === id)))
        .map(s => ({ id: s.id, name: pick(lang, s.name, s.nameZh), color: s.color, photoUrl: s.photoUrl }))
    : []

  return (
    <I18nProvider lang={lang}>
      <link rel="stylesheet" href={themeOf(shop.theme).fontsHref} precedence="default" />
      <div className="s-root" style={themeVars(shop.theme, shop.accent) as React.CSSProperties}>
        <StoreHeader shop={shop} lang={lang} />
        <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-20 pt-2">
          <div className="flex flex-col gap-2">
            {isNew && (
              <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }} aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
            )}
            <span className="text-[12px] font-bold uppercase tracking-[.14em] s-muted">{isNew ? t('mg.booked') : t('mg.yourBooking')}</span>
            <h1 className="s-display text-[32px] leading-tight">{fmtDate(first.date, lang, { weekday: 'long', month: 'long', day: 'numeric' })}<br />{fmtTime(first.startMin, lang)}–{fmtTime(end, lang)}</h1>
            {status === 'cancelled' && <p className="s-chip self-start !h-auto py-1">{first.cancelledBy === 'shop' ? t('mg.cancelledBy.shop') : t('mg.cancelled')}{first.cancelReason ? ` · ${first.cancelReason}` : ''}</p>}
            {status === 'completed' && <p className="s-chip self-start">{t('mg.completed')}</p>}
            {status === 'no_show' && <p className="s-chip self-start">{t('mg.noShow')}</p>}
            {isNew && (emailConfigured() && first.guestEmail
              ? <p className="text-[14px] s-muted">{t('mg.emailSent', first.guestEmail)}</p>
              : <p className="s-card self-start px-3 py-2 text-[14.5px] font-semibold">{t('mg.saveThisPage')}</p>)}
          </div>

          <section className="s-card overflow-hidden">
            {show.map(b => (
              <div key={b.id} className="flex items-center gap-3 border-b p-4 s-line last:border-b-0">
                <Initial name={staffName(b.staffId) || '?'} color={catalog.staff.find(s => s.id === b.staffId)?.color || '#888'} photo={catalog.staff.find(s => s.id === b.staffId)?.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <b className="block">{staffName(b.staffId)}{show.length > 1 && b.guestName ? <span className="font-normal s-muted"> · {b.guestName}</span> : null}</b>
                  <span className="block text-[13.5px] s-muted">{(b.items ?? []).map(i => pick(lang, i.name, i.nameZh)).join(' + ')} · {fmtDuration(b.durationMin, lang)}</span>
                </div>
                {shop.showPrices && b.estPriceCents ? <span className="tnum text-[14px]">{money(b.estPriceCents)}</span> : null}
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-dashed p-4 s-line">
              <span className="text-[13px] s-muted">{t('mg.code')}</span>
              <b className="s-display tnum text-[22px] tracking-[.14em]">{first.code}</b>
            </div>
          </section>
          {show.length > 1 && active.length > 0 && <p className="text-[13.5px] s-muted">{t('mg.groupNote', show.length)}</p>}

          {status === 'confirmed' && (
            <div className="grid grid-cols-2 gap-2">
              <a href={gHref} target="_blank" rel="noreferrer" className="s-btn s-btn-ghost s-btn-sm">{t('mg.google')}</a>
              <a href={`/api/manage/${token}/ics`} className="s-btn s-btn-ghost s-btn-sm">{t('mg.ics')}</a>
              {mapHref && <a href={mapHref} target="_blank" rel="noreferrer" className="s-btn s-btn-ghost s-btn-sm col-span-2">{t('mg.directions')}{where ? ` · ${where}` : ''}</a>}
            </div>
          )}

          {status === 'confirmed' && first.startsAt.getTime() > Date.now() && (first.startsAt.getTime() - Date.now() < 72 * 3600000 || sp.confirm === '1' || !!first.clientConfirmedAt) && (
            <ConfirmAttendance token={token} confirmed={active.every(b => !!b.clientConfirmedAt)} highlight={sp.confirm === '1'} />
          )}

          {status === 'confirmed' && (canChange ? (
            <>
              <p className="text-[14px]">{t('mg.cutoffInfo', cutoffText)}</p>
              <ManageActions token={token} today={nowInZone(shop.timezone).date} maxDays={shop.maxDays} industry={shop.industry}
                single={!!single} currentStaff={single?.staffId ?? null} anyAllowed={shop.allowAnyStaff} choices={choices} />
            </>
          ) : (
            <p className="s-card p-4 text-[14px]">{t('mg.tooLate', fmtDuration(shop.cancelCutoffMinutes, lang), shop.phone || shop.email || '')}</p>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={`/${shop.slug}/book`} className="s-btn s-btn-ghost s-btn-sm">{t('mg.bookAgain')}</Link>
            {shop.phone && <a href={`tel:${shop.phone}`} className="s-btn s-btn-ghost s-btn-sm">{t('mg.contactShop')} · {shop.phone}</a>}
          </div>
        </main>
      </div>
    </I18nProvider>
  )
}
