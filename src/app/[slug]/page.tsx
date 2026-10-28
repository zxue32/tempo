import { hasNailTools } from '@/lib/templates'
import Link from 'next/link'
import { loadStorefront } from '@/lib/storefront'
import { loadCatalog } from '@/lib/data/catalog'
import { listSpecialDays, hoursOn } from '@/lib/data/schedule'
import { makeT, pick, type DictKey } from '@/lib/i18n'
import { nowInZone, weekday, fmtTime, fmtDuration, fmtDate, addDays } from '@/lib/tz'
import { StoreHeader, PreviewBanner, Initial } from '@/components/store'
import { money } from '@/components/ui'
import { env } from '@/lib/env'
import { themeOf } from '@/lib/themes'
import { listGallery, listPalette } from '@/lib/data/rules'
import { HairPalette } from '@/components/HairPalette'
import { looksFrom } from '@/lib/looks'
import { StoreGallery } from '@/components/StoreGallery'
import { Track } from '@/components/Track'

export default async function Storefront(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const { shop, preview, open, lang } = await loadStorefront(slug)
  const t = makeT(lang)
  const name = pick(lang, shop.name, shop.nameZh)

  if (!open) {
    return (
      <div className="min-h-screen">
        <StoreHeader shop={shop} lang={lang} />
        <main className="mx-auto flex max-w-xl flex-col items-start gap-3 px-4 py-16">
          <span className="s-chip">{t('sf2.comingSoon')}</span>
          <h1 className="s-display text-[40px] leading-tight">{name}</h1>
          <p className="s-muted">{t('sf2.comingSoonD')}</p>
          {shop.phone && <p className="tnum">{t('sf2.call')}: {shop.phone}</p>}
        </main>
      </div>
    )
  }

  const theme = themeOf(shop.theme)
  const [{ services, staff, skills }, gallery, palette] = await Promise.all([loadCatalog(shop.id, { forCustomers: true }), listGallery(shop.id), listPalette(shop.id, undefined, true)])
  const hairColors = palette.filter(c => c.kind === 'hair')
  const looks = looksFrom(gallery, staff, services, lang)
  const withWork = new Set(looks.map(l => l.staffId).filter(Boolean))
  const now = nowInZone(shop.timezone)
  const specials = await listSpecialDays(shop.id, now.date)
  const specialMap = new Map(specials.map(s => [s.date, s]))
  const todayHours = hoursOn(shop.hours, specialMap, now.date)
  const isOpen = !!todayHours && now.min >= todayHours.open && now.min < todayHours.close
  let nextOpen: { date: string; open: number } | null = null
  if (!isOpen) {
    for (let i = 0; i < 8; i++) {
      const d = addDays(now.date, i)
      const h = hoursOn(shop.hours, specialMap, d)
      if (h && (i > 0 || now.min < h.open)) { nextOpen = { date: d, open: h.open }; break }
    }
  }
  const team = staff.filter(s => s.active && s.bookableOnline && skills.some(k => k.staffId === s.id))
  const main = services.filter(s => s.kind === 'service')
  const addons = services.filter(s => s.kind === 'addon')
  const cats = Array.from(new Set(main.map(s => s.category)))
  const wdNames = t('c.weekdaysLong').split(',')
  const order = [1, 2, 3, 4, 5, 6, 0]
  const upcomingSpecials = specials.filter(s => s.date <= addDays(now.date, 45))
  const note = pick(lang, shop.bookingNoteEn, shop.bookingNoteZh)
  const cutoffH = shop.cancelCutoffMinutes >= 60 ? fmtDuration(shop.cancelCutoffMinutes, lang) : fmtDuration(shop.cancelCutoffMinutes, lang)
  const where = [shop.address, shop.city].filter(Boolean).join(', ')
  const mapHref = shop.mapUrl || (where ? `https://maps.google.com/?q=${encodeURIComponent(where)}` : null)

  return (
    <div className="min-h-screen pb-28">
      {preview && shop.status !== 'live' && <PreviewBanner text={t('sf2.previewBanner')} />}
      {!preview && <Track slug={shop.slug} step="store" />}
      <StoreHeader shop={shop} lang={lang} />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4">
        <section className="flex flex-col gap-4">
          {shop.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.coverUrl} alt="" className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]" style={{ borderRadius: 'var(--s-rs)' }} />
          ) : (
            <div aria-hidden="true" className="aspect-[21/9] w-full" style={{ borderRadius: 'var(--s-rs)', background: theme.dark
              ? 'repeating-linear-gradient(160deg, #B8382B 0 14px, #F0E8D9 14px 28px, #2B4A7A 28px 42px, #F0E8D9 42px 56px)'
              : `repeating-linear-gradient(100deg, var(--s-soft) 0 26px, color-mix(in srgb, var(--s-accent) 22%, var(--s-bg)) 26px 52px)` }} />
          )}
          <div className="flex flex-col gap-2">
            <h1 className="s-display text-[38px] leading-[1.02] sm:text-[48px]">{name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: isOpen ? '#2E9F64' : 'var(--s-muted)' }} />
                <b>{isOpen ? t('sf2.openNow') : t('sf2.closedNow')}</b>
                <span className="s-muted">
                  {isOpen && todayHours ? t('sf2.until', fmtTime(todayHours.close, lang)) : nextOpen ? t('sf2.opensAt', `${nextOpen.date === now.date ? '' : fmtDate(nextOpen.date, lang) + ' '}${fmtTime(nextOpen.open, lang)}`) : ''}
                </span>
              </span>
              {where && mapHref && <a href={mapHref} target="_blank" rel="noreferrer" className="s-muted underline-offset-2 hover:underline">{where}</a>}
              {shop.phone && <a href={`tel:${shop.phone}`} className="tnum s-muted">{shop.phone}</a>}
              {shop.instagram && <a href={`https://instagram.com/${shop.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="s-muted">@{shop.instagram.replace(/^@/, '')}</a>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/${shop.slug}/book`} className="s-btn">{t('sf2.bookNow')}</Link>
            <Link href={`/${shop.slug}/find`} className="s-btn s-btn-ghost">{t('sf2.findBooking')}</Link>
          </div>
          {pick(lang, shop.aboutEn, shop.aboutZh) && <p className="max-w-[60ch] whitespace-pre-wrap text-[15px]">{pick(lang, shop.aboutEn, shop.aboutZh)}</p>}
        </section>

        <section aria-labelledby="svc-h" className="flex flex-col gap-4">
          <h2 id="svc-h" className="s-display text-[26px]">{t('sf2.services')}</h2>
          {cats.map(c => (
            <div key={c} className="flex flex-col">
              <div className="mb-1 text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t(`cat.${c}` as DictKey)}</div>
              {main.filter(s => s.category === c).map(s => (
                <Link key={s.id} href={`/${shop.slug}/book?service=${s.id}`} className="flex items-center gap-3 border-b py-3 no-underline s-line" style={{ color: 'var(--s-ink)' }}>
                  <span className="min-w-0 flex-1">
                    <b className="block">{pick(lang, s.name, s.nameZh)}</b>
                    <span className="block text-[13px] s-muted">{fmtDuration(s.durationMin, lang)}{pick(lang, s.descEn, s.descZh) ? ' · ' + pick(lang, s.descEn, s.descZh) : ''}</span>
                  </span>
                  {shop.showPrices && s.priceCents != null && <b className="tnum">{s.priceFrom ? t('c.priceFrom', money(s.priceCents)) : money(s.priceCents)}</b>}
                  <span className="s-btn s-btn-ghost s-btn-sm">{t('sf2.book')}</span>
                </Link>
              ))}
            </div>
          ))}
          {addons.length > 0 && (
            <div>
              <div className="mb-1 text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t('cat.addon')}</div>
              <ul className="flex flex-wrap gap-2">
                {addons.map(a => (
                  <li key={a.id} className="s-chip !h-auto py-1.5">
                    + {pick(lang, a.name, a.nameZh)} · {fmtDuration(a.durationMin, lang)}{shop.showPrices && a.priceCents != null ? ` · ${money(a.priceCents)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {looks.length > 0 && (
          <section aria-labelledby="work-h" className="flex flex-col gap-4">
            <h2 id="work-h" className="s-display text-[26px]">{t('gl.title')}</h2>
            <StoreGallery slug={shop.slug} looks={looks.slice(0, 6)} />
            {looks.length > 6 && <Link href={`/${shop.slug}/gallery`} className="s-btn s-btn-ghost self-start">{t('gl.all', looks.length)}</Link>}
          </section>
        )}

        {hairColors.length > 0 && (
          <section aria-labelledby="hair-h" className="flex flex-col gap-4">
            <div>
              <h2 id="hair-h" className="s-display text-[26px]">{t('hc.title')}</h2>
              <p className="text-[14px] s-muted">{t('hc.sub')}</p>
            </div>
            <HairPalette slug={shop.slug} serviceId={main.find(s => s.category === 'hair' && /colou?r|染|dye|balayage|highlight/i.test(s.name + (s.nameZh ?? '')))?.id ?? null}
              swatches={hairColors.map(c => ({ id: c.id, label: pick(lang, c.name, c.nameZh), code: c.code, hex: c.hex, hex2: c.hex2, photoUrl: c.photoUrl }))} />
          </section>
        )}

        {hasNailTools(shop.industry) && (
          <section aria-labelledby="design-h">
            {/* folded: a card that opens the 3D studio on its own page, so the shop page stays light */}
            <Link href={`/${shop.slug}/design`} className="group grid overflow-hidden no-underline sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
              style={{ background: '#16131a', color: '#f6f1ec', borderRadius: 'var(--s-rs)' }}>
              <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
                <span className="text-[12px] tracking-[0.18em] opacity-70">3D · {t("nd.title")}</span>
                <h2 id="design-h" className="s-display text-[28px] leading-tight">{t('lu.teaserT')}</h2>
                <p className="text-[14px] leading-relaxed opacity-80">{t('lu.teaserD')}</p>
                <span className="s-btn mt-2 self-start transition-transform group-hover:translate-x-1">{t('lu.open')} →</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/lune-hand.jpg" alt="" className="h-full max-h-[340px] min-h-[220px] w-full object-cover" loading="lazy" />
            </Link>
          </section>
        )}

        {team.length > 0 && (
          <section aria-labelledby="team-h" className="flex flex-col gap-4">
            <h2 id="team-h" className="s-display text-[26px]">{t('sf2.team')}</h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {team.map(s => (
                <li key={s.id}>
                  <Link href={s.publicPage ? `/${shop.slug}/t/${s.id}` : `/${shop.slug}/book?staff=${s.id}`} className="flex flex-col items-center gap-2 text-center no-underline" style={{ color: 'var(--s-ink)' }}>
                    <Initial name={pick(lang, s.name, s.nameZh)} color={s.color} photo={s.photoUrl} size={72} />
                    <b>{pick(lang, s.name, s.nameZh)}</b>
                    {pick(lang, s.bioEn, s.bioZh) && <span className="text-[12.5px] s-muted">{pick(lang, s.bioEn, s.bioZh)}</span>}
                  </Link>
                  {withWork.has(s.id) && <Link href={`/${shop.slug}/gallery?staff=${s.id}`} className="mt-1 block text-center text-[12.5px] underline-offset-2 hover:underline" style={{ color: 'var(--s-accent)' }}>{t('gl.staffWork')}</Link>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="hours-h" className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 id="hours-h" className="s-display mb-3 text-[26px]">{t('sf2.hours')}</h2>
            <table className="w-full text-[14px]">
              <tbody>
                {order.map(wd => {
                  const h = shop.hours[String(wd)]
                  const today = weekday(now.date) === wd
                  return (
                    <tr key={wd} className={today ? 'font-bold' : ''}>
                      <td className="py-1 pr-4">{wdNames[wd]}</td>
                      <td className="tnum py-1 text-right">{!h || h.closed ? t('c.closed') : `${fmtTime(h.open, lang)} – ${fmtTime(h.close, lang)}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {upcomingSpecials.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-[13.5px]">
                {upcomingSpecials.map(s => (
                  <li key={s.date} className="s-muted">
                    <b style={{ color: 'var(--s-ink)' }}>{fmtDate(s.date, lang)}</b> · {s.closed ? t('c.closed') : `${fmtTime(s.openMin!, lang)} – ${fmtTime(s.closeMin!, lang)}`}{s.note ? ` · ${s.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="s-display mb-3 text-[26px]">{t('sf2.policy')}</h2>
            <p className="text-[14px]">{t('sf2.cutoffPolicy', cutoffH)}</p>
            {note && <p className="mt-2 whitespace-pre-wrap text-[14px]">{note}</p>}
          </div>
        </section>

        <footer className="py-6 text-[12px] s-muted">{t('sf2.poweredBy', env.platformName)}</footer>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t s-line" style={{ background: 'var(--s-bg)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-[14px] s-muted">{name}</span>
          <Link href={`/${shop.slug}/book`} className="s-btn">{t('sf2.bookNow')}</Link>
        </div>
      </div>
    </div>
  )
}
