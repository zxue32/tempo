import QRCode from 'qrcode'
import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listStaff } from '@/lib/data/catalog'
import { getT } from '@/lib/i18n/server'
import { pick } from '@/lib/i18n'
import { env } from '@/lib/env'
import { themeOf } from '@/lib/themes'
import { CopyButton } from '@/components/dash'
import { Initial } from '@/components/store'

export default async function SharePage(props: PageProps<'/dashboard/[shopId]/share'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t, lang } = await getT()
  const staff = (await listStaff(shopId, { activeOnly: true })).filter(s => s.bookableOnline)
  const home = `${env.siteUrl}/${shop.slug}`
  const book = `${home}/book`
  const find = `${home}/find`
  const accent = shop.accent || themeOf(shop.theme).accent
  const svg = await QRCode.toString(home, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14110F', light: '#FFFFFF' } })
  const png = await QRCode.toDataURL(home, { margin: 2, width: 1024, errorCorrectionLevel: 'M' })
  const label = lang === 'zh' ? '在线预约' : 'Book online'
  const snippet = `<a href="${book}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${accent};color:#fff;font:600 15px/1.2 system-ui,sans-serif;text-decoration:none">${label}</a>`
  const tips = ['sh.tip1', 'sh.tip2', 'sh.tip3', 'sh.tip4'] as const

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('sh.title')}</h1>
        <p className="text-muted">{t('sh.sub')}</p>
      </div>
      {shop.status !== 'live' && <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-warn">{t('sh.notLive')}</div>}

      <section className="card flex flex-col gap-3 p-5">
        <LinkRow url={home} openLabel={t('sh.open')} big />
        <LinkRow url={book} openLabel={t('sh.open')} />
        <p className="text-[13px] text-muted">{t('sh.findLink')}</p>
        <LinkRow url={find} openLabel={t('sh.open')} />
      </section>

      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <section className="card flex flex-col items-center gap-3 p-5">
          <h2 className="self-start text-[17px] font-bold">{t('sh.qr')}</h2>
          <div className="w-full max-w-[220px] rounded-lg bg-white p-2" role="img" aria-label={`${t('sh.qr')}: ${home}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <b className="text-center">{pick(lang, shop.name, shop.nameZh)}</b>
          <a className="btn btn-sm btn-block" href={png} download={`${shop.slug}-qr.png`}>{t('sh.downloadQr')}</a>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-[17px] font-bold">{t('sh.where')}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14.5px]">{tips.map(k => <li key={k}>{t(k)}</li>)}</ul>
          <h2 className="mt-3 text-[17px] font-bold">{t('sh.button')}</h2>
          <p className="text-[13.5px] text-muted">{t('sh.buttonHint')}</p>
          <div className="flex items-center gap-3">
            <span dangerouslySetInnerHTML={{ __html: snippet }} />
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-sunk p-3 text-[12px]">{snippet}</pre>
          <div><CopyButton text={snippet} /></div>
        </section>
      </div>

      {staff.length > 0 && (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-[17px] font-bold">{t('sh.staffLinks')}</h2>
          <p className="text-[13.5px] text-muted">{t('sh.staffLinksHint')}</p>
          <ul className="flex flex-col divide-y divide-line-soft">
            {staff.map(s => {
              const url = `${book}?staff=${s.id}`
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Initial name={pick(lang, s.name, s.nameZh)} color={s.color} photo={s.photoUrl} size={34} />
                  <b className="w-28 truncate">{pick(lang, s.name, s.nameZh)}</b>
                  <code className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{url.replace(/^https?:\/\//, '')}</code>
                  <CopyButton text={url} />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {staff.some(s => s.publicPage) && (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-[17px] font-bold">{t('sh.profileLinks')}</h2>
          <p className="text-[13.5px] text-muted">{t('sh.profileLinksHint')}</p>
          <ul className="flex flex-col divide-y divide-line-soft">
            {staff.filter(s => s.publicPage).map(s => {
              const url = `${env.siteUrl}/${shop.slug}/t/${s.id}`
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Initial name={pick(lang, s.name, s.nameZh)} color={s.color} photo={s.photoUrl} size={34} />
                  <b className="w-28 truncate">{pick(lang, s.name, s.nameZh)}</b>
                  <code className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{url.replace(/^https?:\/\//, '')}</code>
                  <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost">{t('sh.open')} ↗</a>
                  <CopyButton text={url} />
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function LinkRow({ url, openLabel, big }: { url: string; openLabel: string; big?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className={`tnum min-w-0 flex-1 truncate rounded-[10px] border border-line bg-sunk px-3 py-2.5 ${big ? 'text-[16px] font-bold text-ink' : 'text-[13.5px]'}`}>{url.replace(/^https?:\/\//, '')}</code>
      <CopyButton text={url} className={big ? 'btn btn-primary' : 'btn btn-sm'} />
      <a href={url} target="_blank" rel="noreferrer" className={big ? 'btn' : 'btn btn-sm btn-ghost'}>{openLabel} ↗</a>
    </div>
  )
}
