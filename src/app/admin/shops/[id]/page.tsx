import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { getShop, readiness } from '@/lib/data/shops'
import { loadCatalog } from '@/lib/data/catalog'
import { sql } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { pick, type DictKey } from '@/lib/i18n'
import { fmtDuration, fmtTime } from '@/lib/tz'
import { env } from '@/lib/env'
import { ShopStatusChip, money } from '@/components/ui'
import { ReviewPanel, SlugForm } from './ReviewPanel'

export default async function AdminShop(props: PageProps<'/admin/shops/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const shop = await getShop(id)
  if (!shop) notFound()
  const { t, lang } = await getT()
  const [issues, catalog, [owner], [stats]] = await Promise.all([
    readiness(id),
    loadCatalog(id),
    sql<{ email: string }[]>`select email from app.users where id = ${shop.ownerId}`,
    sql<{ upcoming: number; total: number }[]>`
      select count(*) filter (where status = 'confirmed' and starts_at > now())::int as upcoming, count(*)::int as total
      from app.bookings where shop_id = ${id} and kind <> 'block'`,
  ])
  const dt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone })
  const wd = t('c.weekdays').split(',')
  const services = catalog.services.filter(s => s.kind === 'service')
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin" className="text-[14px] text-muted">← {t('ad.backToShops')}</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] font-extrabold tracking-tight">{shop.name}</h1>
            <ShopStatusChip status={shop.status} t={t} />
          </div>
          <p className="text-[14px] text-muted">{env.siteUrl.replace(/^https?:\/\//, '')}/<b className="text-ink">{shop.slug}</b>{shop.nameZh ? ` · ${shop.nameZh}` : ''} · {t(`ind.${shop.industry}`)}</p>
        </div>
        <a className="btn" href={`/${shop.slug}`} target="_blank" rel="noreferrer">{t('ad.previewStore')} ↗</a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-2 p-5">
            <h2 className="text-[17px] font-bold">{t('ad.readiness')}</h2>
            {issues.length === 0 ? <p className="text-ok">✓ {t('ad.ready')}</p> : (
              <ul className="flex flex-col gap-1 text-[14px] text-warn">{issues.map(i => <li key={i}>• {t(`set.missing.${i}` as DictKey)}</li>)}</ul>
            )}
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <h2 className="mb-2 text-[17px] font-bold">{t('ad.contact')}</h2>
              <dl className="flex flex-col gap-1 text-[14px]">
                <div><dt className="inline text-muted">{t('ad.owner')}: </dt><dd className="inline">{owner?.email}</dd></div>
                {shop.phone && <div><dt className="inline text-muted">{t('c.phone')}: </dt><dd className="tnum inline">{shop.phone}</dd></div>}
                {shop.email && <div><dt className="inline text-muted">{t('c.email')}: </dt><dd className="inline">{shop.email}</dd></div>}
                {(shop.address || shop.city) && <div><dt className="inline text-muted">{t('ob.address')}: </dt><dd className="inline">{[shop.address, shop.city].filter(Boolean).join(', ')}</dd></div>}
                {shop.instagram && <div><dt className="inline text-muted">Instagram: </dt><dd className="inline">{shop.instagram}</dd></div>}
                <div><dt className="inline text-muted">{t('ob.timezone')}: </dt><dd className="inline">{shop.timezone}</dd></div>
                <div><dt className="inline text-muted">{t('ad.created')}: </dt><dd className="inline">{dt.format(shop.createdAt)}</dd></div>
                {shop.submittedAt && <div><dt className="inline text-muted">{t('ad.colSubmitted')}: </dt><dd className="inline">{dt.format(shop.submittedAt)}</dd></div>}
                {shop.liveAt && <div><dt className="inline text-muted">{t('ad.liveSince')}: </dt><dd className="inline">{dt.format(shop.liveAt)}</dd></div>}
                {shop.inviteCode && <div className="text-muted">{t('ad.viaInvite', shop.inviteCode)}</div>}
                <div><dt className="inline text-muted">{t('ad.upcoming')}: </dt><dd className="tnum inline">{stats.upcoming} / {stats.total}</dd></div>
              </dl>
            </div>
            <div>
              <h2 className="mb-2 text-[17px] font-bold">{t('ad.hours')}</h2>
              <table className="text-[13.5px]"><tbody>
                {[1, 2, 3, 4, 5, 6, 0].map(d => {
                  const h = shop.hours[String(d)]
                  return <tr key={d}><td className="pr-4 text-muted">{wd[d]}</td><td className="tnum">{!h || h.closed ? t('c.closed') : `${fmtTime(h.open, lang)}–${fmtTime(h.close, lang)}`}</td></tr>
                })}
              </tbody></table>
            </div>
            {pick(lang, shop.aboutEn, shop.aboutZh) && <p className="whitespace-pre-wrap text-[14px] sm:col-span-2">{pick(lang, shop.aboutEn, shop.aboutZh)}</p>}
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <h2 className="mb-2 text-[17px] font-bold">{t('ad.menu')} <span className="text-muted">({services.length})</span></h2>
              <ul className="flex flex-col gap-1 text-[13.5px]">
                {services.map(s => <li key={s.id} className="flex justify-between gap-2"><span className={s.active ? '' : 'text-muted line-through'}>{pick(lang, s.name, s.nameZh)}</span><span className="tnum text-muted">{fmtDuration(s.durationMin, lang)} · {money(s.priceCents)}</span></li>)}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 text-[17px] font-bold">{t('ad.team')} <span className="text-muted">({catalog.staff.length})</span></h2>
              <ul className="flex flex-col gap-1 text-[13.5px]">
                {catalog.staff.map(s => <li key={s.id} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /><span className={s.active ? '' : 'text-muted line-through'}>{pick(lang, s.name, s.nameZh)}</span><span className="text-muted">· {catalog.skills.filter(k => k.staffId === s.id).length}</span></li>)}
              </ul>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <ReviewPanel shopId={shop.id} status={shop.status} lastNote={shop.reviewNote} />
          <SlugForm shopId={shop.id} slug={shop.slug} live={shop.status === 'live'} />
        </div>
      </div>
    </div>
  )
}
