import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadStorefront } from '@/lib/storefront'
import { loadCatalog } from '@/lib/data/catalog'
import { listGallery } from '@/lib/data/rules'
import { staffRatings } from '@/lib/bookings'
import { looksFrom } from '@/lib/looks'
import { makeT, pick } from '@/lib/i18n'
import { StoreHeader, PreviewBanner, Initial } from '@/components/store'
import { StoreGallery } from '@/components/StoreGallery'
import { CopyLink } from '@/components/CopyLink'
import { env } from '@/lib/env'

export const metadata = { robots: { index: true } }

/** A technician's own page: photo, bio, specialties, rating, their work, and a "book with me" button. */
export default async function TechnicianPage(props: { params: Promise<{ slug: string; staffId: string }> }) {
  const { slug, staffId } = await props.params
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound()
  const { shop, preview, open, lang } = await loadStorefront(slug)
  const t = makeT(lang)
  const catalog = await loadCatalog(shop.id, { forCustomers: true })
  const st = catalog.staff.find(s => s.id === staffId && s.active && s.publicPage)
  if (!st || !open) notFound()
  const [gallery, ratings] = await Promise.all([listGallery(shop.id, { staffId: st.id }), staffRatings(shop.id)])
  const looks = looksFrom(gallery, catalog.staff, catalog.services, lang)
  const rating = ratings.find(r => r.staffId === st.id)
  const name = pick(lang, st.name, st.nameZh)
  const specialties = lang === 'zh' && st.specialtiesZh.length ? st.specialtiesZh : st.specialties.length ? st.specialties : st.specialtiesZh
  const skills = catalog.skills.filter(k => k.staffId === st.id).map(k => catalog.services.find(s => s.id === k.serviceId)).filter((s): s is NonNullable<typeof s> => !!s && s.kind === 'service')
  const url = `${env.siteUrl}/${shop.slug}/t/${st.id}`
  return (
    <div className="min-h-screen pb-24">
      {preview && shop.status !== 'live' && <PreviewBanner text={t('sf2.previewBanner')} />}
      <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4">
        <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Initial name={name} color={st.color} photo={st.photoUrl} size={128} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="s-display text-[36px] leading-tight">{name}</h1>
            {pick(lang, st.bioEn, st.bioZh) && <p className="text-[15px]">{pick(lang, st.bioEn, st.bioZh)}</p>}
            {rating && rating.count >= 3 ? (
              <p className="text-[14px]"><span aria-hidden="true" style={{ color: 'var(--s-accent)' }}>{'★'.repeat(Math.round(rating.avg))}{'☆'.repeat(5 - Math.round(rating.avg))}</span> <b className="tnum">{rating.avg.toFixed(1)}</b> <span className="s-muted">· {t('tp.ratings', rating.count)}</span></p>
            ) : null}
            {specialties.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start" aria-label={t('tp.specialties')}>
                {specialties.map(sp => <span key={sp} className="s-chip">{sp}</span>)}
              </div>
            )}
            <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
              {st.bookableOnline && <Link href={`/${shop.slug}/book?staff=${st.id}`} className="s-btn">{t('tp.book', name)}</Link>}
              <CopyLink url={url} label={t('tp.share')} done={t('tp.copied')} />
            </div>
          </div>
        </section>
        {skills.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t('sf2.services')}</h2>
            <ul className="flex flex-wrap gap-2">
              {skills.map(s => <li key={s.id}><Link href={`/${shop.slug}/book?staff=${st.id}&service=${s.id}`} className="s-chip no-underline">{pick(lang, s.name, s.nameZh)}</Link></li>)}
            </ul>
          </section>
        )}
        {looks.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="s-display text-[26px]">{t('tp.work')}</h2>
            <StoreGallery slug={shop.slug} looks={looks} columns={3} />
          </section>
        )}
        <footer className="py-6 text-[12px] s-muted">{t('sf2.poweredBy', env.platformName)}</footer>
      </main>
      {st.bookableOnline && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t s-line" style={{ background: 'var(--s-bg)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-[14px] s-muted">{pick(lang, shop.name, shop.nameZh)} · {name}</span>
            <Link href={`/${shop.slug}/book?staff=${st.id}`} className="s-btn">{t('tp.book', name)}</Link>
          </div>
        </div>
      )}
    </div>
  )
}
