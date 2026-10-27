/** Only allow same-site relative redirects. */
export function safeNext(n: unknown, fallback = '/dashboard'): string {
  const s = typeof n === 'string' ? n : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback
}
