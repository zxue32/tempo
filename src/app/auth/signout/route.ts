import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer, supabaseConfigured } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const store = await cookies()
  store.delete('dev_user')
  if (supabaseConfigured()) await (await supabaseServer()).auth.signOut()
  return NextResponse.redirect(new URL('/', req.url), { status: 303 })
}
