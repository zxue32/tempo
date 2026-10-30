import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { listCampaigns, customerTags, openFollowUps } from '@/lib/data/crm'
import { emailConfigured } from '@/lib/email'
import { getT } from '@/lib/i18n/server'
import { nowInZone } from '@/lib/tz'
import { CustomersNav } from '../CustomersNav'
import { Campaigns } from './Campaigns'

export default async function CampaignsPage(props: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  const today = nowInZone(shop.timezone).date
  const [campaigns, tags, due] = await Promise.all([listCampaigns(shopId), customerTags(shopId), openFollowUps(shopId, today)])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('cu.cp.title')}</h1>
        <CustomersNav shopId={shopId} badge={due.length} />
      </div>
      <p className="text-[14px] text-muted">{t('cu.cp.hint')}</p>
      {!emailConfigured() && <p className="card border-warn/40 bg-warn-soft p-3 text-[14px]">{t('cu.cp.noEmail')}</p>}
      <Campaigns shopId={shopId} shopName={shop.name} tags={tags.map(x => x.tag)} emailOn={emailConfigured()}
        campaigns={campaigns.map(c => ({ id: c.id, name: c.name, subject: c.subject, body: c.body, segment: c.segment, status: c.status, createdAt: c.createdAt.toISOString(), sentAt: c.sentAt?.toISOString() ?? null, sentCount: c.sentCount }))} />
    </div>
  )
}
