import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from './env'

/** Supabase client bound to the current request's cookies (server components, actions, route handlers). */
export async function supabaseServer() {
  const store = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  })
}

export function supabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseKey)
}
