// Server logs (CORE-04). Errors are logged by kind and code only: Postgres puts the offending values in an
// error's `detail` ("Key (phone)=(555…) already exists") and some messages quote the input, so neither is printed.
// Nothing a customer typed — names, phone numbers, notes, form answers — belongs in a log line.

const quoted = /"[^"]*"|'[^']*'/g

export function safeError(e: unknown): Record<string, unknown> {
  if (!e || typeof e !== 'object') return { message: String(e).replace(quoted, '"…"').slice(0, 200) }
  const x = e as { name?: string; code?: string; constraint_name?: string; message?: string; stack?: string }
  return {
    name: x.name,
    code: x.code,
    constraint: x.constraint_name,
    message: x.message?.replace(quoted, '"…"').slice(0, 200),
    at: x.stack?.split('\n').slice(1, 5).map(s => s.trim()).join(' | '),
  }
}

export function logError(scope: string, e: unknown) {
  console.error(`[${scope}]`, JSON.stringify(safeError(e)))
}
