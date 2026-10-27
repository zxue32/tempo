import 'server-only'
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>
const N = 16384, R = 8, P = 1, LEN = 32

/** scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // still spend the time so a missing account can't be told apart from a wrong password
    await scrypt(password, randomBytes(16), LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
    return false
  }
  const [kind, n, r, p, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'base64url')
  const got = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), want.length, { N: +n, r: +r, p: +p, maxmem: 64 * 1024 * 1024 })
  return got.length === want.length && timingSafeEqual(got, want)
}

export const newToken = () => randomBytes(32).toString('base64url')
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

/** Constant-time string comparison for setup codes. */
export function sameSecret(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest(), y = createHash('sha256').update(b).digest()
  return timingSafeEqual(x, y) && a.length === b.length
}
