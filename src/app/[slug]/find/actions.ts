'use server'
import { redirect } from 'next/navigation'
import { getShopBySlug } from '@/lib/data/shops'
import { lookupByCode } from '@/lib/bookings'
import { allow, clientKey } from '@/lib/ratelimit'

export type FindState = { error?: 'not_found' | 'rate'; code?: string } | null

export async function findBookingAction(slug: string, _: FindState, form: FormData): Promise<FindState> {
  const code = String(form.get('code') || '').trim().toUpperCase().slice(0, 8)
  const phone = String(form.get('phone') || '').slice(0, 30)
  if (!(await allow('find:' + (await clientKey()), 20, 600))) return { error: 'rate', code }
  const shop = await getShopBySlug(slug)
  const token = shop && code && phone ? await lookupByCode(shop.id, code, phone) : null
  if (token) redirect(`/b/${token}`)
  return { error: 'not_found', code }
}
