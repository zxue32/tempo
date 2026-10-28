import 'server-only'
import { NextResponse } from 'next/server'
import { BookingError } from './bookings'
import { logError } from './log'

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export function errorResponse(e: unknown) {
  if (e instanceof BookingError) {
    const status = e.code === 'not_found' ? 404 : e.code === 'taken' ? 409 : e.code === 'not_open' ? 403 : 422
    return json({ error: e.code, detail: e.detail ?? null }, status)
  }
  logError('api', e)
  return json({ error: 'server' }, 500)
}
