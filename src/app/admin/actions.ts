'use server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { getShop, adminSetStatus, adminChangeSlug, slugTaken, createInvite, deleteInvite } from '@/lib/data/shops'
import { mailOwnerReview } from '@/lib/email'
import { normalizeSlug, slugProblem } from '@/lib/slug'
import { isUniqueViolation } from '@/lib/db'
import type { ShopStatus } from '@/lib/types'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; detail?: string }

const DECISIONS = {
  approve: { to: 'live', from: ['pending', 'changes', 'rejected', 'draft'], mail: 'approved', note: false },
  changes: { to: 'changes', from: ['pending', 'live', 'draft'], mail: 'changes', note: true },
  reject: { to: 'rejected', from: ['pending', 'changes', 'draft'], mail: 'rejected', note: true },
  suspend: { to: 'suspended', from: ['live'], mail: 'suspended', note: true },
  unsuspend: { to: 'live', from: ['suspended'], mail: 'approved', note: false },
} as const
export type Decision = keyof typeof DECISIONS

export async function reviewShopAction(shopId: string, decision: Decision, note: string): Promise<Result> {
  const admin = await requireAdmin()
  const d = DECISIONS[decision]
  if (!d) return { ok: false, error: 'invalid' }
  const shop = await getShop(shopId)
  if (!shop) return { ok: false, error: 'not_found' }
  if (!(d.from as readonly ShopStatus[]).includes(shop.status)) return { ok: false, error: 'invalid', detail: shop.status }
  const clean = note.trim().slice(0, 2000) || null
  if (d.note && !clean) return { ok: false, error: 'note_required' }
  const updated = await adminSetStatus(shopId, d.to, admin.id, clean)
  try { await mailOwnerReview(d.mail, updated, clean) } catch (e) { console.error('review mail failed', e) }
  revalidatePath('/admin', 'layout')
  return { ok: true }
}

export async function changeSlugAction(shopId: string, raw: string): Promise<Result<{ slug: string }>> {
  await requireAdmin()
  const slug = normalizeSlug(raw)
  const problem = slugProblem(slug)
  if (problem) return { ok: false, error: problem }
  if (await slugTaken(slug, shopId)) return { ok: false, error: 'taken' }
  try { await adminChangeSlug(shopId, slug) } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'taken' }
    throw e
  }
  revalidatePath('/admin', 'layout')
  return { ok: true, slug }
}

const inviteSchema = z.object({
  code: z.string().trim().max(32).regex(/^[A-Za-z0-9-]*$/),
  note: z.string().trim().max(200),
  maxUses: z.number().int().min(1).max(1000),
  expires: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
})

export async function createInviteAction(input: z.input<typeof inviteSchema>): Promise<Result<{ code: string }>> {
  const admin = await requireAdmin()
  const p = inviteSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'invalid' }
  const code = (p.data.code || randomBytes(5).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 6)).toUpperCase()
  const expires = p.data.expires ? new Date(p.data.expires + 'T23:59:59Z') : null
  try { await createInvite(code, p.data.note || null, p.data.maxUses, expires, admin.id) } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'taken' }
    throw e
  }
  revalidatePath('/admin/invites')
  return { ok: true, code }
}

export async function deleteInviteAction(code: string): Promise<Result> {
  await requireAdmin()
  await deleteInvite(code)
  revalidatePath('/admin/invites')
  return { ok: true }
}
