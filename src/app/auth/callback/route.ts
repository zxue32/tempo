import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/supabase'
import { safeNext } from '@/lib/url'

// Email confirmation and password-reset links land here.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const next = safeNext(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const supabase = await supabaseServer()
  let ok = false
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error
  return NextResponse.redirect(new URL(ok ? next : '/login?error=callback', url.origin))
}
