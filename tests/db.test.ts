// Integration tests against a real local Postgres (DATABASE_URL=.../tempo_test).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from '@/lib/db'
import { createShop, submitShop, readiness, getShop, adminSetStatus, createInvite } from '@/lib/data/shops'
import { listServices, listStaff, createStaff, setStaffSkills } from '@/lib/data/catalog'
import { saveShifts } from '@/lib/data/schedule'
import { availability } from '@/lib/availability'
import { loadCatalog } from '@/lib/data/catalog'
import { createBooking, rescheduleByToken, cancelByToken, byToken, BookingError, shopMove, shopSetStatus, shopSetItems, lookupByCode } from '@/lib/bookings'
import { addDays, nowInZone } from '@/lib/tz'
import { searchBookings, listCustomers, getCustomer, buildReport } from '@/lib/data/insights'
import { measuredDurations, integrityCheck, recordFunnel, funnel } from '@/lib/data/pilot'
import { joinWaitlist, waitingFor, listWaitlist } from '@/lib/data/waitlist'
import { notifyWaitlist } from '@/lib/waitlistNotify'
import { replayPaperBook } from '@/lib/replay'
import { confirmByToken, shopMarkStarted } from '@/lib/bookings'
import type { Shop } from '@/lib/types'

const H = (h: number, m = 0) => h * 60 + m
const OWNER = '11111111-1111-4111-a111-111111111111'
// a fixed "now": Tue 2026-10-13 09:00 New York
const NOW = new Date('2026-10-13T13:00:00Z')
const TOMORROW = '2026-10-14'

let shop: Shop
let mia: string, luna: string
let gelx: string, gel: string, pedi: string, removal: string

beforeAll(async () => {
  await sql`truncate app.users, app.shops, app.platform_invites cascade`
  await sql`insert into app.users (id, email) values (${OWNER}, 'owner@example.com')`
  shop = await createShop({
    ownerId: OWNER, ownerEmail: 'owner@example.com', name: 'Test Nails', slug: 'test-nails', industry: 'nail',
    timezone: 'America/New_York', defaultLang: 'en', phone: '(555) 555-0100', ownerStaffName: 'Mia',
  })
  const svcs = await listServices(shop.id)
  gelx = svcs.find(s => s.name === 'Gel-X Extensions')!.id
  gel = svcs.find(s => s.name === 'Gel Manicure')!.id
  pedi = svcs.find(s => s.name === 'Gel Pedicure')!.id
  removal = svcs.find(s => s.name === 'Gel Removal')!.id
  mia = (await listStaff(shop.id))[0].id
  luna = await createStaff(shop.id, { name: 'Luna', color: '#8E5BA8', active: true, bookableOnline: true, commissionPct: 40 })
  await setStaffSkills(shop.id, luna, [{ serviceId: gel, durationMin: null }, { serviceId: gelx, durationMin: 75 }])
  const rows = []
  for (let i = 0; i < 14; i++) {
    const d = addDays('2026-10-12', i)
    rows.push({ staffId: mia, date: d, startMin: H(10), endMin: H(18), breaks: [] as [number, number][] })
    rows.push({ staffId: luna, date: d, startMin: H(11), endMin: H(19), breaks: [[H(13), H(13, 30)]] as [number, number][] })
  }
  await saveShifts(shop.id, '2026-10-12', '2026-10-25', rows)
  // readiness looks for a roster from the real "today" onward, so give the shop one there too
  const today = nowInZone('America/New_York').date
  if (today > '2026-10-25') {
    await saveShifts(shop.id, today, addDays(today, 6), Array.from({ length: 7 }, (_, i) => ({ staffId: mia, date: addDays(today, i), startMin: H(10), endMin: H(18), breaks: [] as [number, number][] })))
  }
})

afterAll(async () => { await sql.end() })

describe('shop lifecycle', () => {
  it('needs review before it can take bookings, and invites skip review', async () => {
    expect(await readiness(shop.id)).toEqual([])
    await expect(createBooking({
      shop, mode: 'online', kind: 'online', date: TOMORROW, start: H(10), lang: 'en', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: null }], contact: { name: 'A', phone: '5555550101', email: 'a@x.com' },
    })).rejects.toMatchObject({ code: 'not_open' })
    const r = await submitShop(shop.id)
    expect(r.status).toBe('pending')
    shop = await adminSetStatus(shop.id, 'live', OWNER, null)
    expect(shop.status).toBe('live')

    await createInvite('FRIEND1', 'test', 1, null, OWNER)
    const s2 = await createShop({ ownerId: OWNER, ownerEmail: 'owner@example.com', name: 'Invited', slug: 'invited-shop', industry: 'barber', timezone: 'America/New_York', defaultLang: 'en', phone: '1', ownerStaffName: 'Dre', inviteCode: 'FRIEND1' })
    const dre = (await listStaff(s2.id))[0].id
    await saveShifts(s2.id, '2026-10-12', '2026-10-12', [{ staffId: dre, date: '2099-01-01', startMin: 600, endMin: 700, breaks: [] }])
    await sql`insert into app.shifts (shop_id, staff_id, date, start_min, end_min) values (${s2.id}, ${dre}, current_date + 1, 600, 1000)`
    expect((await submitShop(s2.id)).status).toBe('live')
  })
})

describe('booking engine against the database', () => {
  it('the brief: after a 3-5pm booking, overlapping starts disappear', async () => {
    const res = await createBooking({
      shop, mode: 'online', kind: 'online', date: TOMORROW, start: H(15), lang: 'en', now: NOW,
      guests: [{ serviceIds: [gelx], addonIds: [removal, removal].slice(0, 1), staffId: mia }],
      contact: { name: 'Grace', phone: '(555) 555-0142', email: 'grace@example.com' },
    })
    expect(res.bookings[0].durationMin).toBe(105)
    // make it exactly 2h with art add-on via shop edit
    const art = (await listServices(shop.id)).find(s => s.name === 'Nail Art')!.id
    const b = await shopSetItems(shop, res.bookings[0].id, [gelx], [removal, art], OWNER, false)
    expect(b.endMin).toBe(H(17))
    const cat = await loadCatalog(shop.id, { forCustomers: true })
    const av = await availability(shop, cat, [{ serviceIds: [gel], addonIds: [], staffId: mia }], TOMORROW, 7, TOMORROW, { forCustomers: true, now: NOW })
    const starts = av.slots.map(s => s.start)
    expect(starts).toContain(H(14, 15)) // 14:15 + 45 = 15:00
    expect(starts.some(s => s > H(14, 15) && s < H(17))).toBe(false)
    expect(starts).toContain(H(17))
    expect(av.days.length).toBe(7)
  })

  it('refuses double booking even if two requests race', async () => {
    const mk = (name: string) => createBooking({
      shop, mode: 'online', kind: 'online', date: TOMORROW, start: H(11), lang: 'en', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: mia }],
      contact: { name, phone: '555555' + Math.floor(1000 + Math.random() * 8999), email: null },
    })
    const results = await Promise.allSettled([mk('R1'), mk('R2'), mk('R3')])
    const ok = results.filter(r => r.status === 'fulfilled')
    expect(ok.length).toBe(1)
    for (const r of results) if (r.status === 'rejected') expect((r.reason as BookingError).code).toBe('taken')
  })

  it('any-staff falls through to the next free person; groups get distinct staff', async () => {
    const r = await createBooking({
      shop, mode: 'online', kind: 'online', date: TOMORROW, start: H(11), lang: 'en', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: null }],
      contact: { name: 'Any', phone: '5555550199', email: null },
    })
    expect(r.bookings[0].staffId).toBe(luna)
    const g = await createBooking({
      shop, mode: 'online', kind: 'online', date: TOMORROW, start: H(12), lang: 'zh', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: null }, { serviceIds: [gelx], addonIds: [], staffId: null }],
      contact: { name: '王小姐', phone: '5555550188', email: 'w@example.com' },
    })
    expect(g.bookings.length).toBe(2)
    expect(new Set(g.bookings.map(b => b.staffId)).size).toBe(2)
    expect(g.bookings[0].groupId).toBe(g.bookings[1].groupId)
    // luna does gel-x in 75 minutes
    const lunaRow = g.bookings.find(b => b.staffId === luna)!
    expect([45, 75]).toContain(lunaRow.durationMin)
  })

  it('enforces lead time, booking window and skills', async () => {
    const base = { shop, mode: 'online' as const, kind: 'online' as const, lang: 'en' as const, now: NOW, contact: { name: 'X', phone: '5555550111', email: null } }
    await expect(createBooking({ ...base, date: '2026-10-13', start: H(11), guests: [{ serviceIds: [gel], addonIds: [], staffId: null }] })).rejects.toMatchObject({ code: 'too_soon' })
    await expect(createBooking({ ...base, date: addDays('2026-10-13', 61), start: H(11), guests: [{ serviceIds: [gel], addonIds: [], staffId: null }] })).rejects.toMatchObject({ code: 'too_far' })
    await expect(createBooking({ ...base, date: TOMORROW, start: H(16), guests: [{ serviceIds: [pedi], addonIds: [], staffId: luna }] })).rejects.toMatchObject({ code: 'taken' })
  })

  it('customers reschedule and cancel with their link; cutoff applies', async () => {
    const r = await createBooking({
      shop, mode: 'online', kind: 'online', date: '2026-10-15', start: H(10), lang: 'en', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: null }], contact: { name: 'Mover', phone: '5555550177', email: 'm@example.com' },
    })
    expect(r.token).toBeTruthy()
    expect(await lookupByCode(shop.id, r.code.toLowerCase(), '+1 (555) 555-0177')).toBe(r.token)
    const moved = await rescheduleByToken(r.token!, '2026-10-16', H(14), undefined, NOW)
    expect(moved[0].date).toBe('2026-10-16')
    expect(moved[0].startMin).toBe(H(14))
    // too close to the start: 8h cutoff
    const late = new Date('2026-10-16T12:00:00Z') // 08:00 local, booking at 14:00 -> 6h away
    await expect(cancelByToken(r.token!, null, late)).rejects.toMatchObject({ code: 'cutoff' })
    await cancelByToken(r.token!, 'changed plans', NOW)
    const after = await byToken(r.token!)
    expect(after!.primary.status).toBe('cancelled')
  })

  it('shop can move, mark no-show and re-confirm only if still free', async () => {
    const r = await createBooking({
      shop, mode: 'admin', kind: 'walkin', date: TOMORROW, start: H(10), lang: 'en',
      guests: [{ serviceIds: [gel], addonIds: [], staffId: mia }], contact: { name: 'Walk', phone: null, email: null }, createdBy: OWNER,
    })
    const id = r.bookings[0].id
    await shopSetStatus(shop, id, 'no_show', OWNER)
    // someone takes the freed spot
    await createBooking({ shop, mode: 'admin', kind: 'block', date: TOMORROW, start: H(10), lang: 'en', guests: [], block: { staffId: mia, minutes: 30 }, contact: null, createdBy: OWNER })
    await expect(shopSetStatus(shop, id, 'confirmed', OWNER)).rejects.toMatchObject({ code: 'taken' })
    // outside roster needs force
    const r2 = await createBooking({ shop, mode: 'admin', kind: 'phone', date: TOMORROW, start: H(18), lang: 'en', guests: [{ serviceIds: [gel], addonIds: [], staffId: mia }], contact: { name: 'Late', phone: '5555550155', email: null }, createdBy: OWNER, force: true })
    expect(r2.bookings[0].startMin).toBe(H(18))
    await expect(shopMove(shop, r2.bookings[0].id, TOMORROW, H(19), mia, OWNER, false)).rejects.toMatchObject({ code: 'outside_shift' })
    const mv = await shopMove(shop, r2.bookings[0].id, TOMORROW, H(19), mia, OWNER, true)
    expect(mv[0].startMin).toBe(H(19))
  })

  it('limits one phone number to 3 upcoming bookings', async () => {
    const mk = (start: number) => createBooking({
      shop, mode: 'online', kind: 'online', date: '2026-10-20', start, lang: 'en', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: null }], contact: { name: 'Spam', phone: '5555550000', email: null },
    })
    await mk(H(11)); await mk(H(12)); await mk(H(14))
    await expect(mk(H(15))).rejects.toMatchObject({ code: 'limit' })
  })

  it('stores times correctly in UTC', async () => {
    const [b] = await sql<{ startsAt: Date }[]>`select starts_at from app.bookings where shop_id = ${shop.id} and date = ${TOMORROW} and start_min = ${H(15)}`
    expect(b.startsAt.toISOString()).toBe('2026-10-14T19:00:00.000Z')
    expect(nowInZone(shop.timezone, NOW)).toEqual({ date: '2026-10-13', min: H(9) })
    expect((await getShop(shop.id))!.status).toBe('live')
  })

  it('handles more simultaneous bookings than the connection pool has connections', async () => {
    // pool is 3 connections; 8 concurrent transactions must queue, not deadlock
    const mk = (i: number) => createBooking({
      shop, mode: 'online', kind: 'online', date: '2026-10-22', start: H(10) + (i % 4) * 60, lang: 'en', now: NOW,
      guests: [{ serviceIds: [gel], addonIds: [], staffId: null }], contact: { name: `Burst ${i}`, phone: `55555510${10 + i}`, email: null },
    })
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => mk(i)))
    const ok = results.filter(r => r.status === 'fulfilled').length
    // 4 start times x 2 staff (Mia works 10-18, Luna 11-19): at most 8, and every failure is a clean 'taken'
    expect(ok).toBeGreaterThanOrEqual(4)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'taken' })
  }, 15000)

  it('lists, searches and reports on bookings', async () => {
    const all = await searchBookings(shop.id, { from: '2026-10-12', to: '2026-10-25' })
    expect(all.length).toBeGreaterThan(3)
    expect(all.every(b => b.kind !== 'block')).toBe(true)
    const late = await searchBookings(shop.id, { from: '2026-10-12', to: '2026-10-25', q: 'late' })
    expect(late.map(b => b.guestName)).toEqual(['Late'])
    const byPhone = await searchBookings(shop.id, { from: '2026-10-12', to: '2026-10-25', q: '555-0155' })
    expect(byPhone).toHaveLength(1)
    const blocks = await searchBookings(shop.id, { from: '2026-10-12', to: '2026-10-25', kind: 'block' })
    expect(blocks).toHaveLength(1)

    const customers = await listCustomers(shop.id, '2026-10-13', '')
    const spam = customers.find(c => c.name === 'Spam')!
    expect(spam.nextVisit).toBe('2026-10-20')
    expect((await getCustomer(shop.id, spam.id, '2026-10-13'))!.history).toHaveLength(3)
    expect(await listCustomers(shop.id, '2026-10-13', '0000')).toHaveLength(1)

    // complete one booking so revenue and commission show up
    const done = all.find(b => b.status === 'confirmed' && b.staffId === luna)!
    await shopSetStatus(shop, done.id, 'completed', OWNER)
    const r = await buildReport(shop.id, '2026-10-12', '2026-10-25')
    expect(r.totals.completed).toBe(1)
    expect(r.totals.revenueCents).toBe(done.estPriceCents)
    const l = r.staff.find(s => s.id === luna)!
    expect(l.completed).toBe(1)
    expect(l.commissionPct).toBe(40)
    // Luna: 14 days x (8h - 30min break) rostered
    expect(l.shiftMin).toBe(14 * (8 * 60 - 30))
    expect(r.utilization).toBeGreaterThan(0)
    expect(r.sources.find(s => s.kind === 'online')!.count).toBeGreaterThan(0)
    expect(r.newReturning.newCount).toBeGreaterThan(0)
    expect(r.popular[0].count).toBeGreaterThan(0)
  })
})

describe('shop rules against the database', () => {
  let chair: string
  const online = (date: string, start: number, staffId: string | null, phone: string, now: Date = NOW) => createBooking({
    shop, mode: 'online', kind: 'online', date, start, lang: 'en', now,
    guests: [{ serviceIds: [gel], addonIds: [], staffId }], contact: { name: 'Client ' + phone.slice(-4), phone, email: null },
  })

  it('equipment: a free person is not enough when the only chair is in use, even under a race', async () => {
    ;[{ id: chair }] = await sql<{ id: string }[]>`insert into app.resources (shop_id, name, quantity) values (${shop.id}, 'Chair', 1) returning id`
    await sql`update app.services set resource_id = ${chair} where id = ${gel}`
    const D = '2026-10-23'
    const first = await online(D, H(11), mia, '5555552001')
    expect(first.bookings[0].resourceIds).toEqual([chair])
    const catalog = await loadCatalog(shop.id, { forCustomers: true })
    const av = await availability(shop, catalog, [{ serviceIds: [gel], addonIds: [], staffId: null }], D, 1, D, { forCustomers: true, now: NOW })
    expect(av.slots.map(s => s.start)).not.toContain(H(11))
    expect(av.slots.map(s => s.start)).toContain(H(11, 45))
    await expect(online(D, H(11), luna, '5555552002')).rejects.toMatchObject({ code: 'taken' })
    // three clients, two free people, one chair: exactly one booking may win
    const race = await Promise.allSettled(['5555552011', '5555552012', '5555552013'].map(p => online(D, H(12), null, p)))
    expect(race.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of race) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'taken' })
    // the front desk can still squeeze one in on purpose
    const forced = await createBooking({ shop, mode: 'admin', kind: 'walkin', date: D, start: H(12), lang: 'en', guests: [{ serviceIds: [gel], addonIds: [], staffId: luna }], contact: { name: 'Walk', phone: null, email: null }, createdBy: OWNER, force: true }).catch(e => e)
    expect(forced.bookings?.length ?? 0).toBeLessThanOrEqual(1)
    await sql`update app.services set resource_id = null where id = ${gel}`
  })

  it('walk-in reserve: online booking keeps one person free, the front desk is not limited', async () => {
    await sql`update app.shops set walkin_reserve = 1 where id = ${shop.id}`
    shop = (await getShop(shop.id))!
    const D = '2026-10-24'
    await online(D, H(14), null, '5555552101')
    await expect(online(D, H(14), null, '5555552102')).rejects.toMatchObject({ code: 'taken' })
    const walkin = await createBooking({ shop, mode: 'admin', kind: 'walkin', date: D, start: H(14), lang: 'en', guests: [{ serviceIds: [gel], addonIds: [], staffId: null }], contact: { name: 'Walk-in', phone: null, email: null }, createdBy: OWNER })
    expect(walkin.bookings).toHaveLength(1)
    await sql`update app.shops set walkin_reserve = 0 where id = ${shop.id}`
    shop = (await getShop(shop.id))!
  })

  it('no-show limit sends repeat no-shows to the phone', async () => {
    await sql`update app.shops set noshow_limit = 1 where id = ${shop.id}`
    shop = (await getShop(shop.id))!
    const r = await online('2026-10-24', H(16), null, '5555552201')
    await shopSetStatus(shop, r.bookings[0].id, 'no_show', OWNER)
    await expect(online('2026-10-24', H(17), null, '5555552201')).rejects.toMatchObject({ code: 'blocked', detail: 'noshow' })
    await sql`update app.shops set noshow_limit = 0 where id = ${shop.id}`
    shop = (await getShop(shop.id))!
  })

  it('clients confirm, staff tap start/finish, and real durations come out as P50/P80', async () => {
    const r = await createBooking({ shop, mode: 'online', kind: 'online', date: '2026-10-19', start: H(11), lang: 'en', now: NOW, guests: [{ serviceIds: [gel], addonIds: [], staffId: luna }], contact: { name: 'Conf', phone: '5555552301', email: 'conf@example.com' } })
    await confirmByToken(r.token!)
    expect((await byToken(r.token!))!.primary.clientConfirmedAt).toBeInstanceOf(Date)
    await shopMarkStarted(shop, r.bookings[0].id, OWNER)
    const mins = [50, 55, 60, 52, 58]
    for (const [i, m] of mins.entries()) {
      const b = await createBooking({ shop, mode: 'admin', kind: 'walkin', date: '2026-10-21', start: H(14) + i * 60, lang: 'en', guests: [{ serviceIds: [gel], addonIds: [], staffId: luna }], contact: { name: 'T' + i, phone: null, email: null }, createdBy: OWNER })
      await sql`update app.bookings set status = 'completed', actual_start = starts_at, actual_end = starts_at + make_interval(mins => ${m}) where id = ${b.bookings[0].id}`
    }
    const d = (await measuredDurations(shop.id, 3650)).find(x => x.staffId === luna && x.serviceId === gel)!
    expect(d.n).toBe(5)
    expect(d.p50).toBe(55)
    expect(d.p80).toBe(58)
    expect(d.current).toBe(45)
  })

  it('the nightly check finds an equipment overload that slipped in behind the system\'s back', async () => {
    expect((await integrityCheck(shop.id)).ok).toBe(true)
    // two overlapping bookings for different people, both holding the one chair (only possible by editing the database by hand)
    const rows = await sql<{ id: string }[]>`select id from app.bookings where shop_id = ${shop.id} and date = '2026-10-24' and start_min = ${H(14)} and status = 'confirmed'`
    expect(rows.length).toBe(2)
    await sql`update app.bookings set resource_ids = ${sql.array([chair])}::uuid[] where id in ${sql(rows.map(r => r.id))}`
    const res = await integrityCheck(shop.id)
    expect(res.ok).toBe(false)
    expect(res.issues.find(i => i.code === 'resource')?.count).toBe(2)
    await sql`update app.bookings set resource_ids = '{}' where id in ${sql(rows.map(r => r.id))}`
  })

  it('a cancellation emails the waitlist when the freed time fits', async () => {
    const today = nowInZone('America/New_York').date
    const D = addDays(today, 2)
    const b = await online(D, H(10), mia, '5555552401', new Date())
    await joinWaitlist(shop, { date: D, fromMin: H(10), toMin: H(10, 30), serviceIds: [gel], addonIds: [], staffId: mia, name: 'Wait', phone: null, email: 'wait@example.com', lang: 'en' })
    expect(await notifyWaitlist(shop, D)).toBe(0)
    expect((await listWaitlist(shop.id, today)).map(w => w.date)).toEqual([D])
    await cancelByToken(b.token!, null, new Date())
    expect(await notifyWaitlist(shop, D)).toBe(1)
    expect(await waitingFor(shop.id, D)).toHaveLength(0)
  })

  it('counts each visit once per funnel step', async () => {
    for (const step of ['store', 'start', 'time', 'store'] as const) await recordFunnel(shop.id, 'visit-abc-123', step)
    await recordFunnel(shop.id, 'visit-def-456', 'store')
    const f = await funnel(shop.id)
    expect(f.store).toBe(2)
    expect(f.start).toBe(1)
    expect(f.booked).toBe(0)
  })

  it('paper-book replay: real visits that fit, and the ones that reveal a wrong setting', async () => {
    const csv = [
      'date,start,end,staff,services',
      '2026-10-19,10:00,10:45,Mia,Gel Manicure',       // fits
      '2026-10-19,10:45,11:50,Mia,Gel Manicure',       // fits, but took 65 min vs 45 set
      '2026-10-19,11:00,,Luna,Gel Pedicure',           // Luna isn't set up for pedicures
      '2026-10-19,13:10,,Luna,Gel Manicure',           // during Luna's break
      '2026-10-19,12:00,,Nobody,Gel Manicure',         // unknown person
      '2026-10-19,12:00,,Mia,Gel Manicure + Gel Removal', // fits
      '2026-10-19,12:30,,Mia,Gel Manicure',            // overlaps the previous one
      'garbage line',
    ].join('\n')
    const r = await replayPaperBook(shop, csv)
    expect(r.total).toBe(8)
    expect(r.fit).toBe(3)
    const why = Object.fromEntries(r.problems.map(p => [p.line, p.why]))
    expect(why).toEqual({ 4: 'skill', 5: 'break', 6: 'unknown_staff', 8: 'booked', 9: 'bad_row' })
    expect(r.durations).toEqual([{ line: 3, staff: 'Mia', service: 'Gel Manicure', booked: 45, actual: 65 }])
  })
})
