import 'server-only'
import { sql } from './db'
import { env, platformAdminEmails } from './env'
import { makeT, pick } from './i18n'
import type { Booking, Lang, Shop } from './types'
import { fmtDate, fmtTime, fmtDuration } from './tz'

type Mail = { to: string; subject: string; html: string; text: string; template: string; shopId?: string | null; bookingId?: string | null; replyTo?: string | null }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY)

/** Sends through Resend when RESEND_API_KEY is set; otherwise logs and records "skipped". Never throws. */
export async function sendMail(m: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || `${env.platformName} <bookings@example.com>`
  let status: 'sent' | 'failed' | 'skipped' = 'skipped'
  let providerId: string | null = null
  let error: string | null = null
  if (!m.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.to)) return
  if (key) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo || undefined }),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      if (res.ok) { status = 'sent'; providerId = body.id ?? null } else { status = 'failed'; error = body.message || `HTTP ${res.status}` }
    } catch (e) {
      status = 'failed'
      error = (e as Error).message
    }
  } else if (process.env.NODE_ENV === 'development') {
    // local development only: show the message so links can be clicked
    console.log(`[email skipped: no RESEND_API_KEY] to=${m.to} subject=${m.subject}\n${m.text}\n`)
  } else if (process.env.NODE_ENV !== 'test') {
    // never the recipient, the text or its links (manage and password links are keys) — CORE-04
    console.log(`[email skipped: no RESEND_API_KEY] template=${m.template}`)
  }
  try {
    await sql`
      insert into app.email_log (shop_id, booking_id, to_email, template, subject, status, provider_id, error)
      values (${m.shopId ?? null}, ${m.bookingId ?? null}, ${m.to}, ${m.template}, ${m.subject}, ${status}, ${providerId}, ${error})
    `
  } catch { /* logging must never break a booking */ }
}

function layout(opts: { accent: string; title: string; lead: string; rows: Array<[string, string]>; button?: { href: string; label: string }; extra?: string[]; footer: string }) {
  const rows = opts.rows.map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#6b6470;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#1d1a1f">${v}</td></tr>`).join('')
  const extra = (opts.extra ?? []).map(p => `<p style="margin:0 0 12px;color:#1d1a1f">${p}</p>`).join('')
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2f3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="height:6px;background:${opts.accent}"></td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;color:#1d1a1f">${esc(opts.title)}</h1>
<p style="margin:0 0 16px;color:#1d1a1f">${opts.lead}</p>
${rows ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px;font-size:15px">${rows}</table>` : ''}
${extra}
${opts.button ? `<p style="margin:8px 0 24px"><a href="${esc(opts.button.href)}" style="display:inline-block;background:${opts.accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${esc(opts.button.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #eee;color:#8a8390;font-size:12px">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`
  return html
}

function plain(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join('\n')
}

export function manageUrl(token: string) {
  return `${env.siteUrl}/b/${token}`
}

type StaffLite = { id: string; name: string; nameZh: string | null }

function bookingFacts(shop: Shop, group: Booking[], staff: StaffLite[], lang: Lang) {
  const t = makeT(lang)
  const first = group[0]
  const when = `${fmtDate(first.date, lang, { weekday: 'long', month: 'long', day: 'numeric' })} · ${fmtTime(first.startMin, lang)}`
  const what = group.map(b => {
    const items = (b.items ?? []).map(i => pick(lang, i.name, i.nameZh)).join(' + ')
    const st = staff.find(s => s.id === b.staffId)
    const who = st ? t('em.withWho', pick(lang, st.name, st.nameZh)) : ''
    return `${items}${who ? ' · ' + who : ''} · ${fmtDuration(b.durationMin, lang)}`
  })
  const where = [shop.address, shop.city].filter(Boolean).join(', ')
  return { when, what, where }
}

function cutoffText(shop: Shop, b: Booking, lang: Lang) {
  const t = new Date(b.startsAt.getTime() - shop.cancelCutoffMinutes * 60000)
  const s = t.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: shop.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return makeT(lang)('em.cutoff', s)
}

export type CustomerMailKind = 'confirmed' | 'rescheduled' | 'cancelled' | 'cancelled_by_shop' | 'reminder'

export async function mailCustomer(kind: CustomerMailKind, shop: Shop, group: Booking[], staff: StaffLite[], reason?: string | null) {
  const first = group[0]
  if (!first?.guestEmail) return
  const lang = first.lang
  const t = makeT(lang)
  const shopName = pick(lang, shop.name, shop.nameZh)
  const { when, what, where } = bookingFacts(shop, group, staff, lang)
  const dateShort = fmtDate(first.date, lang)
  const time = fmtTime(first.startMin, lang)
  const accent = shop.accent || '#A3223D'
  const subj = {
    confirmed: t('em.confirmedSubj', dateShort, time),
    rescheduled: t('em.rescheduledSubj', dateShort, time),
    cancelled: t('em.cancelledSubj', dateShort, time),
    cancelled_by_shop: t('em.cancelledSubj', dateShort, time),
    reminder: t('em.reminderSubj', dateShort, time),
  }[kind]
  const lead = {
    confirmed: t('em.confirmedLead', esc(shopName)),
    rescheduled: t('em.rescheduledLead', esc(shopName)),
    cancelled: t('em.cancelledLead', esc(shopName)),
    cancelled_by_shop: t('em.cancelledByShopLead', esc(shopName)),
    reminder: t('em.reminderLead', esc(shopName)),
  }[kind]
  const active = kind !== 'cancelled' && kind !== 'cancelled_by_shop'
  const url = first.manageToken ? manageUrl(first.manageToken) : null
  const rows: Array<[string, string]> = [
    [t('em.when'), esc(when)],
    [t('em.what'), what.map(esc).join('<br>')],
  ]
  if (where) rows.push([t('em.where'), esc(where)])
  rows.push([t('em.code'), `<b style="letter-spacing:2px">${esc(first.code)}</b>`])
  const extra: string[] = []
  if (reason) extra.push(esc(t('em.reason', reason)))
  if (active) extra.push(esc(cutoffText(shop, first, lang)))
  const footer = esc(t('em.footer', env.platformName, shopName, shop.phone || shop.email || ''))
  // reminders ask the client to confirm; the link opens a page with a button (mail scanners never confirm by visiting)
  const ask = kind === 'reminder' && url && !first.clientConfirmedAt
  if (ask) extra.unshift(`<b>${esc(t('em.reminderConfirm'))}</b>`)
  const html = layout({
    accent, title: subj, lead: `${esc(t('em.hi', first.guestName || ''))}<br>${lead}`, rows, extra, footer,
    button: url && active ? (ask ? { href: url + '?confirm=1', label: t('em.confirmBtn') } : { href: url, label: t('em.manage') }) : undefined,
  })
  const text = plain([
    t('em.hi', first.guestName || ''), lead.replace(/<[^>]+>/g, ''), '',
    `${t('em.when')}: ${when}`, `${t('em.what')}: ${what.join('; ')}`, where ? `${t('em.where')}: ${where}` : null,
    `${t('em.code')}: ${first.code}`, reason ? t('em.reason', reason) : null, active ? cutoffText(shop, first, lang) : null,
    ask ? `${t('em.reminderConfirm')} ${url}?confirm=1` : url && active ? `${t('em.manage')}: ${url}` : null, '', t('em.footer', env.platformName, shopName, shop.phone || shop.email || ''),
  ])
  await sendMail({ to: first.guestEmail, subject: subj, html, text, template: 'customer_' + kind, shopId: shop.id, bookingId: first.id, replyTo: shop.email })
}

/** "A spot opened up" for someone on the waitlist. */
export async function mailWaitlist(shop: Shop, w: { email: string; name: string; lang: Lang; date: string; id: string }, times: number[], link: string) {
  const lang = w.lang
  const t = makeT(lang)
  const shopName = pick(lang, shop.name, shop.nameZh)
  const day = fmtDate(w.date, lang, { weekday: 'long', month: 'long', day: 'numeric' })
  const list = times.slice(0, 6).map(m => fmtTime(m, lang)).join(', ')
  const subj = t('em.waitSubj', shopName, fmtDate(w.date, lang))
  const footer = esc(t('em.footer', env.platformName, shopName, shop.phone || shop.email || ''))
  const html = layout({
    accent: shop.accent || '#A3223D', title: subj, lead: `${esc(t('em.hi', w.name))}<br>${esc(t('em.waitLead', shopName, day))}`,
    rows: [[t('em.when'), esc(`${day} · ${list}`)]], extra: [esc(t('em.waitNote'))], footer,
    button: { href: link, label: t('em.waitBook') },
  })
  const text = plain([t('em.hi', w.name), t('em.waitLead', shopName, day), `${day}: ${list}`, t('em.waitNote'), `${t('em.waitBook')}: ${link}`])
  await sendMail({ to: w.email, subject: subj, html, text, template: 'waitlist', shopId: shop.id, replyTo: shop.email })
}

export type ShopMailKind = 'new' | 'cancelled' | 'rescheduled'

/** Alerts to the shop's notification emails and (optionally) to the booked staff member. */
export async function mailShop(kind: ShopMailKind, shop: Shop, group: Booking[], staff: StaffLite[]) {
  const first = group[0]
  if (!first) return
  const recipients = new Map<string, Lang>()
  for (const e of shop.notifyEmails ?? []) if (e) recipients.set(e.toLowerCase(), 'zh')
  if (shop.notifyStaff) {
    const rows = await sql<{ email: string; lang: Lang; staffId: string }[]>`
      select u.email, u.lang, m.staff_id from app.shop_members m join app.users u on u.id = m.user_id
      where m.shop_id = ${shop.id} and m.staff_id in ${sql(group.map(b => b.staffId))}
    `
    for (const r of rows) recipients.set(r.email.toLowerCase(), r.lang)
  }
  const owners = await sql<{ email: string; lang: Lang }[]>`
    select u.email, u.lang from app.shop_members m join app.users u on u.id = m.user_id where m.shop_id = ${shop.id}
  `
  for (const o of owners) if (recipients.has(o.email.toLowerCase())) recipients.set(o.email.toLowerCase(), o.lang)
  for (const [to, lang] of recipients) {
    const t = makeT(lang)
    const { when, what } = bookingFacts(shop, group, staff, lang)
    const who = first.guestName || '—'
    const subjKey = kind === 'new' ? 'em.shopNewSubj' : kind === 'cancelled' ? 'em.shopCancelSubj' : 'em.shopReschedSubj'
    const subject = t(subjKey, fmtDate(first.date, lang), fmtTime(first.startMin, lang), who)
    const link = `${env.siteUrl}/dashboard/${shop.id}?date=${first.date}&open=${first.id}`
    const rows: Array<[string, string]> = [
      [t('em.when'), esc(when)],
      [t('em.what'), what.map(esc).join('<br>')],
      [t('c.name'), esc(who)],
    ]
    if (first.guestPhone) rows.push([t('c.phone'), esc(first.guestPhone)])
    if (first.guestEmail) rows.push([t('c.email'), esc(first.guestEmail)])
    if (first.notes) rows.push([t('c.notes'), esc(first.notes)])
    if (first.cancelReason) rows.push([t('em.reason', ''), esc(first.cancelReason)])
    const html = layout({ accent: '#2E45D9', title: subject, lead: esc(pick(lang, shop.name, shop.nameZh)), rows, button: { href: link, label: t('em.shopOpen') }, footer: esc(env.platformName) })
    const text = plain([subject, '', ...rows.map(([k, v]) => `${k}: ${v.replace(/<br>/g, '; ').replace(/<[^>]+>/g, '')}`), '', link])
    await sendMail({ to, subject, html, text, template: 'shop_' + kind, shopId: shop.id, bookingId: first.id })
  }
}

export type ReviewMailKind = 'approved' | 'changes' | 'rejected' | 'suspended'

export async function mailOwnerReview(kind: ReviewMailKind, shop: Shop, note: string | null) {
  const [owner] = await sql<{ email: string; lang: Lang }[]>`select email, lang from app.users where id = ${shop.ownerId}`
  if (!owner) return
  const t = makeT(owner.lang)
  const name = pick(owner.lang, shop.name, shop.nameZh)
  const subject = t(({ approved: 'em.approvedSubj', changes: 'em.changesSubj', rejected: 'em.rejectedSubj', suspended: 'em.suspendedSubj' } as const)[kind], name)
  const body = t(({ approved: 'em.approvedBody', changes: 'em.changesBody', rejected: 'em.rejectedBody', suspended: 'em.suspendedBody' } as const)[kind], name)
  const storeUrl = `${env.siteUrl}/${shop.slug}`
  const dash = `${env.siteUrl}/dashboard/${shop.id}`
  const extra = kind === 'approved' ? [`<a href="${esc(storeUrl)}">${esc(storeUrl)}</a>`] : note ? [esc(note).replace(/\n/g, '<br>')] : []
  const html = layout({ accent: '#2E45D9', title: subject, lead: esc(body), rows: [], extra, button: { href: kind === 'approved' ? storeUrl : dash, label: kind === 'approved' ? storeUrl.replace(/^https?:\/\//, '') : t('em.shopOpen') }, footer: esc(env.platformName) })
  await sendMail({ to: owner.email, subject, html, text: plain([subject, '', body, kind === 'approved' ? storeUrl : note, '', dash]), template: 'review_' + kind, shopId: shop.id })
}

export async function mailAdminsNewApplication(shop: Shop, ownerEmail: string) {
  for (const to of platformAdminEmails()) {
    const t = makeT('zh')
    const subject = t('em.newAppSubj', shop.name)
    const link = `${env.siteUrl}/admin/shops/${shop.id}`
    const html = layout({ accent: '#2E45D9', title: subject, lead: esc(t('em.newAppBody', shop.name, ownerEmail)), rows: [], button: { href: link, label: t('em.reviewNow') }, footer: esc(env.platformName) })
    await sendMail({ to, subject, html, text: plain([subject, link]), template: 'admin_new_application', shopId: shop.id })
  }
}

export async function mailStaffInvite(shop: Shop, email: string, lang: Lang, link: string) {
  const t = makeT(lang)
  const name = pick(lang, shop.name, shop.nameZh)
  const subject = t('em.staffInviteSubj', name)
  const html = layout({ accent: shop.accent || '#2E45D9', title: subject, lead: esc(t('em.staffInviteBody', name)), rows: [], button: { href: link, label: t('em.join') }, footer: esc(env.platformName) })
  await sendMail({ to: email, subject, html, text: plain([subject, link]), template: 'staff_invite', shopId: shop.id })
}

export async function mailPasswordReset(email: string, lang: Lang, link: string) {
  const t = makeT(lang)
  const subject = t('em.resetSubj', env.platformName)
  const html = layout({ accent: '#2E45D9', title: subject, lead: esc(t('em.resetBody')), rows: [], button: { href: link, label: t('auth.updatePassword') }, footer: esc(env.platformName) })
  await sendMail({ to: email, subject, html, text: plain([subject, t('em.resetBody'), link]), template: 'password_reset' })
}
