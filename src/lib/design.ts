import type { NailDesign } from './types'

/** A nail design as a URL-safe token (base64url JSON) so a link can carry it into the booking flow. */
export function encodeDesign(d: NailDesign): string {
  return Buffer.from(JSON.stringify(d), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
