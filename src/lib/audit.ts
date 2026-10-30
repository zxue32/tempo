import 'server-only'
import { sql, type Q } from './db'

// Who did what to sensitive data (CORE-04). Record field names and counts, never the values themselves.
export type AuditEntry = {
  shopId: string | null
  actorUser: string | null
  /** "<subject>.<verb>", e.g. customer.update, bookings.export, member.remove */
  action: string
  targetType?: string | null
  targetId?: string | null
  detail?: Record<string, string | number | boolean | string[] | null>
}

export async function audit(q: Q, e: AuditEntry) {
  await q`
    insert into app.audit_log (shop_id, actor_user, action, target_type, target_id, detail)
    values (${e.shopId}, ${e.actorUser}, ${e.action}, ${e.targetType ?? null}, ${e.targetId ?? null}, ${sql.json((e.detail ?? {}) as never)})
  `
}

export async function listAudit(shopId: string, limit = 100) {
  return sql<{ id: string; actorUser: string | null; action: string; targetType: string | null; targetId: string | null; detail: Record<string, unknown>; at: Date }[]>`
    select id, actor_user, action, target_type, target_id, detail, at from app.audit_log
    where shop_id = ${shopId} order by at desc, id desc limit ${limit}
  `
}
