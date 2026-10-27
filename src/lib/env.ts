// Central place for configuration read from environment variables.
export const env = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  platformName: process.env.NEXT_PUBLIC_PLATFORM_NAME || 'Tempo',
  /** only used for photo storage, together with SUPABASE_SECRET_KEY (optional; photos go to the database otherwise) */
  supabaseUrl: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
}

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Local development login without Supabase. Never active in production builds. */
export function devAuthEnabled(): boolean {
  return process.env.DEV_FAKE_AUTH === '1' && process.env.NODE_ENV !== 'production'
}
