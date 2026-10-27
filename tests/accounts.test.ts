// Built-in accounts and database photo storage, against the test database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from '@/lib/db'
import { createAccount, checkLogin, startSession, accountForToken, endSession, createResetToken, resetTokenAccount, useResetToken, changePassword, AccountError } from '@/lib/accounts'
import { hashPassword, verifyPassword } from '@/lib/password'
import { storeImage } from '@/lib/storage'
import { GET as media } from '@/app/media/[...path]/route'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')

beforeAll(async () => {
  process.env.PLATFORM_ADMIN_EMAILS = 'boss@example.com'
  process.env.ADMIN_SETUP_CODE = 'right-code-123'
  await sql`delete from app.users where email like '%@acct.test' or email = 'boss@example.com'`
})
afterAll(async () => { await sql.end() })

describe('passwords', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const a = await hashPassword('correct horse'), b = await hashPassword('correct horse')
    expect(a).not.toBe(b)
    expect(a.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(await verifyPassword('correct horse', a)).toBe(true)
    expect(await verifyPassword('correct horsf', a)).toBe(false)
    expect(await verifyPassword('anything', null)).toBe(false)
  })
})

describe('accounts and sessions', () => {
  it('signs up, refuses duplicates and weak passwords, logs in, and sessions resolve and end', async () => {
    const a = await createAccount({ email: ' Ann@Acct.Test ', password: 'password-1' })
    expect(a.email).toBe('ann@acct.test')
    await expect(createAccount({ email: 'ann@acct.test', password: 'password-2' })).rejects.toMatchObject({ code: 'exists' })
    await expect(createAccount({ email: 'bob@acct.test', password: 'short' })).rejects.toMatchObject({ code: 'weak_password' })
    await expect(createAccount({ email: 'not-an-email', password: 'password-1' })).rejects.toMatchObject({ code: 'bad_email' })
    await expect(checkLogin('ann@acct.test', 'wrong-password')).rejects.toMatchObject({ code: 'bad_login' })
    await expect(checkLogin('nobody@acct.test', 'password-1')).rejects.toMatchObject({ code: 'bad_login' })
    const ok = await checkLogin('ANN@acct.test', 'password-1')
    expect(ok.id).toBe(a.id)
    const token = await startSession(a.id, 'vitest')
    const [row] = await sql<{ tokenHash: string }[]>`select token_hash from app.sessions where user_id = ${a.id}`
    expect(row.tokenHash).not.toBe(token) // only the hash is stored
    expect(await accountForToken(token)).toMatchObject({ id: a.id, email: 'ann@acct.test', platformAdmin: false })
    expect(await accountForToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull()
    await sql`update app.users set disabled = true where id = ${a.id}`
    expect(await accountForToken(token)).toBeNull()
    await expect(checkLogin('ann@acct.test', 'password-1')).rejects.toMatchObject({ code: 'disabled' })
    await sql`update app.users set disabled = false where id = ${a.id}`
    await endSession(token)
    expect(await accountForToken(token)).toBeNull()
    await sql`update app.sessions set expires_at = now() - interval '1 second' where user_id = ${a.id}`
  })

  it("the admin's email can only be registered with the setup code", async () => {
    await expect(createAccount({ email: 'boss@example.com', password: 'password-1' })).rejects.toMatchObject({ code: 'needs_setup_code' })
    await expect(createAccount({ email: 'boss@example.com', password: 'password-1', setupCode: 'wrong' })).rejects.toBeInstanceOf(AccountError)
    const boss = await createAccount({ email: 'boss@example.com', password: 'password-1', setupCode: 'right-code-123' })
    const t = await startSession(boss.id, null)
    expect((await accountForToken(t))!.platformAdmin).toBe(true)
  })

  it('reset links work once and sign out other browsers; changing a password needs the current one', async () => {
    const u = await createAccount({ email: 'cara@acct.test', password: 'password-1' })
    const s = await startSession(u.id, null)
    const link = await createResetToken(u.id, null)
    expect((await resetTokenAccount(link))!.email).toBe('cara@acct.test')
    await expect(useResetToken(link, 'short')).rejects.toMatchObject({ code: 'weak_password' })
    await useResetToken(link, 'brand-new-pass')
    await expect(useResetToken(link, 'another-pass')).rejects.toMatchObject({ code: 'bad_token' })
    expect(await accountForToken(s)).toBeNull()
    await checkLogin('cara@acct.test', 'brand-new-pass')
    await expect(changePassword(u.id, 'wrong', 'whatever-123')).rejects.toMatchObject({ code: 'bad_login' })
    await changePassword(u.id, 'brand-new-pass', 'final-pass-1')
    await checkLogin('cara@acct.test', 'final-pass-1')
    // a second link replaces the first
    const l1 = await createResetToken(u.id, null), l2 = await createResetToken(u.id, null)
    expect(await resetTokenAccount(l1)).toBeNull()
    expect(await resetTokenAccount(l2)).not.toBeNull()
  })
})

describe('photos in the database', () => {
  it('stores an upload and serves it back with long-lived caching; refuses non-images and odd paths', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    const url = await storeImage(new File([PNG], 'a.png', { type: 'image/png' }), 'gallery/00000000-0000-4000-a000-000000000000')
    expect(url).toMatch(/^\/media\/gallery\/00000000-0000-4000-a000-000000000000\/[0-9a-f]{32}\.png$/)
    const parts = url.replace('/media/', '').split('/')
    const res = await media(new Request('http://x' + url), { params: Promise.resolve({ path: parts }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true)
    await expect(storeImage(new File([Buffer.from('<svg></svg>')], 'x.svg'), 'gallery/00000000-0000-4000-a000-000000000000')).rejects.toThrow('bad_type')
    const bad = await media(new Request('http://x/media/../etc'), { params: Promise.resolve({ path: ['..', 'etc', 'passwd'] }) })
    expect(bad.status).toBe(404)
  })
})
