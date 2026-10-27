'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createShop, slugTaken, inviteValid } from '@/lib/data/shops'
import { normalizeSlug, slugProblem } from '@/lib/slug'
import { isValidTimeZone } from '@/lib/tz'
import { isUniqueViolation } from '@/lib/db'
import type { DictKey } from '@/lib/i18n'
import type { Industry, Lang } from '@/lib/types'

export type SlugCheck = { slug: string; ok: boolean; reason?: DictKey }

export async function checkSlug(raw: string): Promise<SlugCheck> {
  await requireUser('/onboarding')
  const slug = normalizeSlug(raw)
  const p = slugProblem(slug)
  if (p) return { slug, ok: false, reason: p === 'short' ? 'ob.slugShort' : p === 'reserved' ? 'ob.slugReserved' : 'ob.slugFormat' }
  if (await slugTaken(slug)) return { slug, ok: false, reason: 'ob.slugTaken' }
  return { slug, ok: true }
}

export type CreateState = { error?: DictKey; field?: string } | null

export async function createShopAction(_: CreateState, form: FormData): Promise<CreateState> {
  const user = await requireUser('/onboarding')
  const name = String(form.get('name') || '').trim().slice(0, 80)
  const nameZh = String(form.get('nameZh') || '').trim().slice(0, 80) || null
  const industry = String(form.get('industry') || 'nail') as Industry
  const slug = normalizeSlug(String(form.get('slug') || ''))
  const phone = String(form.get('phone') || '').trim().slice(0, 30) || null
  const address = String(form.get('address') || '').trim().slice(0, 200) || null
  const city = String(form.get('city') || '').trim().slice(0, 80) || null
  const timezone = String(form.get('timezone') || 'America/New_York')
  const defaultLang = (form.get('defaultLang') === 'zh' ? 'zh' : 'en') as Lang
  const meToo = form.get('meToo') === 'on'
  const myName = String(form.get('myName') || '').trim().slice(0, 60)
  const invite = String(form.get('invite') || '').trim().toUpperCase() || null

  if (!name) return { error: 'c.error', field: 'name' }
  if (!['nail', 'barber', 'both'].includes(industry)) return { error: 'c.error', field: 'industry' }
  const p = slugProblem(slug)
  if (p) return { error: p === 'short' ? 'ob.slugShort' : p === 'reserved' ? 'ob.slugReserved' : 'ob.slugFormat', field: 'slug' }
  if (!isValidTimeZone(timezone)) return { error: 'c.error', field: 'timezone' }
  if (invite && !(await inviteValid(invite))) return { error: 'ob.invalidInvite', field: 'invite' }

  let id: string
  try {
    const shop = await createShop({
      ownerId: user.id, ownerEmail: user.email, name, nameZh, slug, industry, phone, address, city, timezone, defaultLang,
      inviteCode: invite, ownerStaffName: meToo ? myName || name : null,
    })
    id = shop.id
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'ob.slugTaken', field: 'slug' }
    throw e
  }
  ;(await cookies()).delete('tempo_invite')
  redirect(`/dashboard/${id}/setup`)
}
