// Applies db/migrations/*.sql in order. Usage: DATABASE_URL=... npm run db:migrate
import postgres from 'postgres'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL (or DIRECT_DATABASE_URL) first.'); process.exit(1) }

const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url)
const sql = postgres(url, { max: 1, onnotice: () => {}, ssl: local ? false : 'require' })
try {
  await sql`create schema if not exists app`
  await sql`create table if not exists app.schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  const done = new Set((await sql`select name from app.schema_migrations`).map(r => r.name))
  const dir = join(root, 'db', 'migrations')
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  let n = 0
  for (const f of files) {
    if (done.has(f)) continue
    const text = readFileSync(join(dir, f), 'utf8')
    await sql.begin(async tx => {
      await tx.unsafe(text)
      await tx`insert into app.schema_migrations (name) values (${f})`
    })
    console.log('applied', f); n++
  }
  console.log(n ? `done, ${n} migration(s) applied` : 'database is up to date')
} catch (e) {
  console.error('migration failed:', e.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
