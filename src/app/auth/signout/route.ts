import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { endSession } from '@/lib/accounts'
import { SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const store = await cookies()
  await endSession(store.get(SESSION_COOKIE)?.value)
  store.delete(SESSION_COOKIE)
  store.delete('dev_user')
  return NextResponse.redirect(new URL('/', req.url), { status: 303 })
}
