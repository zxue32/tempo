import 'server-only'
import postgres from 'postgres'

type Sql = postgres.Sql<{}>
declare global {
  // eslint-disable-next-line no-var
  var __tempoSql: Sql | undefined
}

function make(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url)
  return postgres(url, {
    // Hosted databases (Supabase) are reached over TLS
    ssl: local ? false : 'require',
    // Supabase's pooler (transaction mode) does not support prepared statements
    prepare: false,
    max: Number(process.env.DB_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    // snake_case columns <-> camelCase fields
    transform: postgres.camel,
    types: {
      // keep DATE columns as 'YYYY-MM-DD' strings (shop-local calendar dates)
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  })
}

/** Lazily created so builds don't need a database. */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  get(_t, prop) {
    const real = (globalThis.__tempoSql ??= make())
    const v = (real as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v
  },
  apply(_t, _this, args) {
    const real = (globalThis.__tempoSql ??= make())
    return (real as unknown as (...a: unknown[]) => unknown)(...args)
  },
}) as Sql

export type Tx = postgres.TransactionSql<{}>
/** Either the pool or a transaction: anything you can run a query on. */
export type Q = postgres.ISql<{}>

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = e as { code?: string; constraint_name?: string }
  return err?.code === '23505' && (!constraint || err.constraint_name === constraint)
}
export function isOverlapViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === '23P01'
}
