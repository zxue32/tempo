import { requireShop } from '@/lib/auth'
import { getShop } from '@/lib/data/shops'
import { getT } from '@/lib/i18n/server'
import { env } from '@/lib/env'
import { SettingsForm } from './SettingsForm'

export default async function SettingsPage(props: PageProps<'/dashboard/[shopId]/settings'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const { t } = await getT()
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('sg.title')}</h1>
      <SettingsForm shop={shop} siteUrl={env.siteUrl} />
    </div>
  )
}
