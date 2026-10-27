'use client'
// Anonymous step counts for the booking funnel: a random id per tab, no cookies, no personal data.

/** One random id per visit, kept for the tab only. Used for the anonymous step counts. */
export function visitId(): string {
  try {
    const k = 'tempo.visit'
    let v = sessionStorage.getItem(k)
    if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem(k, v) }
    return v
  } catch {
    return Math.random().toString(36).slice(2, 14)
  }
}
export function track(slug: string, step: 'store' | 'start' | 'time' | 'details') {
  try {
    const body = JSON.stringify({ session: visitId(), step })
    if (!navigator.sendBeacon?.(`/api/public/${slug}/event`, body)) fetch(`/api/public/${slug}/event`, { method: 'POST', body, keepalive: true }).catch(() => {})
  } catch { /* never block booking */ }
}

