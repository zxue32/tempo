import 'server-only'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { sql } from './db'

/** Client IP (hashed) for rate limiting; never stored in plain form. */
export async function clientKey(): Promise<string> {
  const h = await headers()
  // Netlify's own header can't be set by the client; x-forwarded-for can, so it is the last resort
  const ip = h.get('x-nf-client-connection-ip') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  return createHash('sha256').update('tempo-ip:' + ip).digest('hex').slice(0, 24)
}

/** Records a hit and returns false when `key` exceeded `limit` hits within `windowSec`. */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  // only for load tests on a test database; never set this on the live site
  if (process.env.LOADTEST_DISABLE_RATE_LIMIT === '1') return true
  const [{ n }] = await sql<{ n: number }[]>`
    with ins as (insert into app.rate_events (key) values (${key}) returning 1)
    select count(*)::int as n from app.rate_events where key = ${key} and at > now() - make_interval(secs => ${windowSec})
  `
  if (Math.random() < 0.02) await sql`delete from app.rate_events where at < now() - interval '2 days'`
  return n < limit
}
