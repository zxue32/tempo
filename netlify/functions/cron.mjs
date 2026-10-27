// Netlify scheduled function: every hour at minute 7 (UTC).
// Calls the site's own cron route, which sends "see you tomorrow" emails
// and runs each live shop's daily integrity check (see src/app/api/cron/reminders/route.ts).
// Needs CRON_SECRET in the site's environment variables (scope: Functions).
export default async () => {
  const site = (Netlify.env.get('NEXT_PUBLIC_SITE_URL') || Netlify.env.get('URL') || '').replace(/\/$/, '')
  const secret = Netlify.env.get('CRON_SECRET')
  if (!site || !secret) {
    console.log('cron: NEXT_PUBLIC_SITE_URL or CRON_SECRET is not set, skipping')
    return
  }
  const res = await fetch(`${site}/api/cron/reminders`, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  })
  console.log('cron', res.status, (await res.text()).slice(0, 500))
}

export const config = { schedule: '7 * * * *' }
