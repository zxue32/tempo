import Link from 'next/link'
import { requireShop } from '@/lib/auth'
import { getShop, readiness } from '@/lib/data/shops'
import { getT } from '@/lib/i18n/server'
import { SubmitButton } from '../SubmitButton'
import type { DictKey } from '@/lib/i18n'
import { listResources, listGallery } from '@/lib/data/rules'

export default async function Setup(props: PageProps<'/dashboard/[shopId]/setup'>) {
  const { shopId } = await props.params
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const [issues, resources, gallery] = await Promise.all([readiness(shopId), listResources(shopId), listGallery(shopId, { limit: 3 })])
  const rulesTouched = resources.length > 0 || shop.walkinReserve > 0 || shop.assignMode !== 'balanced' || shop.minGap > 0 || shop.noshowLimit > 0
  const { t } = await getT()
  const base = `/dashboard/${shopId}`
  const steps: Array<{ title: DictKey; desc: DictKey; href: string; done: boolean }> = [
    { title: 'set.services', desc: 'set.servicesD', href: base + '/services', done: !issues.includes('no_services') },
    { title: 'set.staff', desc: 'set.staffD', href: base + '/staff', done: !issues.includes('no_staff') && !issues.includes('no_skills') },
    { title: 'set.roster', desc: 'set.rosterD', href: base + '/schedule', done: !issues.includes('no_roster') },
    { title: 'set.hours', desc: 'set.hoursD', href: base + '/settings', done: !issues.includes('no_hours') && !issues.includes('no_contact') },
    { title: 'set.rules', desc: 'set.rulesD', href: base + '/rules', done: rulesTouched },
    { title: 'set.look', desc: 'set.lookD', href: base + '/settings#look', done: !!(shop.logoUrl || shop.coverUrl) },
    { title: 'set.gallery', desc: 'set.galleryD', href: base + '/gallery', done: gallery.length >= 3 },
  ]
  const submitted = shop.status !== 'draft' && shop.status !== 'changes' && shop.status !== 'rejected'
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-[28px] font-extrabold tracking-tight">{t('set.title')}</h1>
      <p className="mb-5 text-muted">{t('set.sub')}</p>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="card flex flex-wrap items-center gap-4 p-4">
            <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-[14px] font-bold ${s.done ? 'bg-ok-soft text-ok' : 'bg-sunk text-muted'}`}>{s.done ? '✓' : i + 1}</span>
            <div className="min-w-0 flex-1">
              <b className="block">{t(s.title)}</b>
              <span className="text-[14px] text-muted">{t(s.desc)}</span>
            </div>
            <Link href={s.href} className={`btn btn-sm ${s.done ? '' : 'btn-dark'}`}>{s.done ? t('c.edit') : t('set.go')}</Link>
          </li>
        ))}
        <li className="card flex flex-wrap items-center gap-4 border-accent p-4">
          <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-[14px] font-bold ${submitted ? 'bg-ok-soft text-ok' : 'bg-accent text-white'}`}>{submitted ? '✓' : steps.length + 1}</span>
          <div className="min-w-0 flex-1">
            <b className="block">{t('set.submit')}</b>
            <span className="text-[14px] text-muted">{submitted ? t(`st.${shop.status}`) : t('set.submitD')}</span>
          </div>
          {!submitted && <SubmitButton shopId={shopId} label={t('set.submit')} />}
        </li>
      </ol>
      {issues.length > 0 && (
        <div className="mt-5 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {t('set.cantSubmit')}
          <ul className="mt-1 list-disc pl-5">{issues.map(i => <li key={i}>{t(`set.missing.${i}` as DictKey)}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
