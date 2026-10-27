import { z } from 'zod'

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const minuteOfDay = z.number().int().min(0).max(1440)

export const guestSchema = z.object({
  serviceIds: z.array(uuid).min(1).max(8),
  addonIds: z.array(uuid).max(8).default([]),
  staffId: uuid.nullable(),
})
export const guestsSchema = z.array(guestSchema).min(1).max(10)

export const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/
export const phoneDigits = (s: string) => s.replace(/\D/g, '')

export const trimOrNull = (v: unknown, max = 500): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
