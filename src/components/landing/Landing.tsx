'use client'
// The platform's front door for shop owners: a deep 3D space where glitter takes the shape of each trade,
// gathers into a live booking calendar as you scroll, then shows the tools in real interface fragments.
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, MotionConfig } from 'motion/react'
import { useI18n, LangToggle } from '@/components/i18n'
import { Button, Glass, Reveal, Tilt, useCalm } from '@/components/ds'
import { TRADES, TRADE_COLORS, TRADE_MESH, type Trade } from './shapes'
import { TRADE_INFO, HAIR_SHADES, type Booking } from './trades'
import type { Slots, Stage } from './scene'
import { SceneCanvas } from './SceneCanvas'

const LOOKS_ZH = ['月光猫眼', '冰透裸色', '琥珀碎金', '奶灰细闪', '星空跳色', '醋酸贝壳', '珍珠法式', '巧克力镜面']
const LOOKS_EN = ['Moonlight cat-eye', 'Jelly nude', 'Amber gold', 'Oat shimmer', 'Galaxy accent', 'Acetate shell', 'Pearl french', 'Chocolate gloss']

export function Landing({ loggedIn, platform }: { loggedIn: boolean; platform: string }) {
  const { t, lang } = useI18n()
  const tx = t as (k: string, ...a: Array<string | number>) => string
  const L = <T extends { zh: string; en: string }>(x: T) => (lang === 'zh' ? x.zh : x.en)
  const calm = useCalm()
  const [trade, setTrade] = useState<Trade>('nail')
  const [picked, setPicked] = useState(false)
  const [stage, setStage] = useState<Stage>('hero')
  const [calP, setCalP] = useState(0)
  const calRef = useRef<HTMLElement>(null), endRef = useRef<HTMLElement>(null), pickRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLDivElement>(null), figRef = useRef<HTMLElement>(null), markRef = useRef<HTMLParagraphElement>(null)
  const [slots, setSlots] = useState<Slots>({})
  const info = TRADE_INFO[trade]
  const start = loggedIn ? '/onboarding' : '/signup'

  // the trades take turns until the owner picks theirs
  useEffect(() => {
    if (picked || calm || stage !== 'hero') return
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') setTrade(x => TRADES[(TRADES.indexOf(x) + 1) % TRADES.length]) }, 5200)
    return () => window.clearInterval(id)
  }, [picked, calm, stage])

  // which formation the particles hold depends on where the page is
  useEffect(() => {
    let raf = 0
    const run = () => {
      raf = 0
      const vh = window.innerHeight, cal = calRef.current?.getBoundingClientRect(), end = endRef.current?.getBoundingClientRect()
      if (!cal || !end) return
      let s: Stage = 'hero'
      if (end.top < vh * 0.75) s = 'ring'
      else if (cal.top < vh * 0.55 && cal.bottom > vh * 0.5) s = 'calendar'
      else if (cal.bottom <= vh * 0.5) s = 'field'
      setStage(s)
      setCalP(Math.min(1, Math.max(0, (vh * 0.5 - cal.top) / Math.max(1, cal.height - vh * 0.9))))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run) }
    run()
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // tell the 3D scene which boxes on the page its formations belong in
  useEffect(() => {
    const measure = () => {
      const art = artRef.current?.getBoundingClientRect(), fig = figRef.current?.getBoundingClientRect()
      const sticky = (calRef.current?.firstElementChild as HTMLElement | null)?.getBoundingClientRect(), mark = markRef.current?.getBoundingClientRect()
      const y = window.scrollY, next: Slots = {}
      if (art) next.hero = { x: art.left, y: art.top + y, w: art.width, h: art.height }
      if (fig && sticky) next.calendar = { x: fig.left, y: fig.top - sticky.top, w: fig.width, h: fig.height }
      if (mark) next.ring = { x: mark.left, y: mark.top + y, w: mark.width, h: mark.height, follow: true }
      const r = (v: Slots) => JSON.stringify(v, (_, n) => (typeof n === 'number' ? Math.round(n / 4) : n))
      setSlots(prev => (r(prev) === r(next) ? prev : next))
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    const ro = new ResizeObserver(measure)
    if (document.body) ro.observe(document.body)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const choose = useCallback((x: Trade) => { setPicked(true); setTrade(x) }, [])
  // arrow keys move through the trades, as in any radio group
  const pickKeys = (e: React.KeyboardEvent, x: Trade) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = TRADES[(TRADES.indexOf(x) + d + TRADES.length) % TRADES.length]
    choose(next)
    pickRef.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[TRADES.indexOf(next)]?.focus()
  }
  // keep the current trade in view in the phone's swipe row
  useEffect(() => {
    const row = pickRef.current
    if (!row || row.scrollWidth <= row.clientWidth + 1) return
    const el = row.querySelectorAll<HTMLElement>('[role=radio]')[TRADES.indexOf(trade)]
    if (el) row.scrollTo({ left: el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2, behavior: calm ? 'auto' : 'smooth' })
  }, [trade, calm])
  const mesh = TRADE_MESH[trade]
  const rootStyle = { '--ds-mesh-a': mesh[0], '--ds-mesh-b': mesh[1], '--ds-mesh-c': mesh[2] } as React.CSSProperties
  const staffWord = tx(`staffWord.${info.industry}`)
  const shown = Math.floor(calP * (info.bookings.length + 1.5))
  const latest = info.bookings[Math.min(info.bookings.length - 1, Math.max(0, shown - 1))]

  return (
    <MotionConfig reducedMotion="user">
    <div className="ds-root" style={rootStyle}>
      <div className="ds-mesh" aria-hidden="true" />
      <SceneCanvas trade={trade} stage={stage} slots={slots} />
      <div className="ds-grain" aria-hidden="true" />

      <header className="sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
          <Glass className="flex items-center gap-2 !rounded-full px-3 py-2 sm:gap-4 sm:px-4">
            <Link href="/" className="flex items-center gap-2 text-[19px] font-bold tracking-tight no-underline" style={{ color: 'var(--ds-ink)' }}>
              <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="#F4F1F8" /><path d="M15 7v8l5 3" stroke="#0B0A14" strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="22" cy="8" r="2.6" fill="#8C9BFF" /></svg>
              {platform}
            </Link>
            <nav aria-label={t('lp.nav.feat')} className="ml-4 hidden items-center gap-1 md:flex">
              {[['#live', 'lp.nav.cal'], ['#features', 'lp.nav.feat'], ['#steps', 'lp.nav.steps']].map(([h, k]) => (
                <a key={h} href={h} className="ds-btn ds-btn-ghost ds-btn-sm">{tx(k)}</a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <LangToggle className="ds-btn ds-btn-ghost ds-btn-sm" />
              {loggedIn
                ? <Button href="/dashboard" variant="primary" size="sm">{t('home.dashboard')}</Button>
                : <><Button href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">{t('home.login')}</Button><Button href="/signup" variant="primary" size="sm">{t('home.cta')}</Button></>}
            </div>
          </Glass>
        </div>
      </header>

      <main>
        {/* ---------- the trade, in light */}
        <section aria-labelledby="hero-h" className="relative mx-auto grid min-h-[calc(100svh-72px)] max-w-7xl grid-cols-1 items-center gap-8 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:pt-10">
          <div className="order-2 flex min-w-0 flex-col gap-6 md:order-1">
            <Reveal className="order-2 min-w-0 md:order-1">
              {/* one swipeable row on a phone, wrapped on wider screens */}
              <div ref={pickRef} role="radiogroup" aria-label={t('lp.picker')}
                className="ds-chip-row -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1.5 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
                <span className="mr-1 flex-none text-[14px] ds-muted">{t('lp.picker')}</span>
                {TRADES.map(x => (
                  <button key={x} type="button" role="radio" aria-checked={trade === x} tabIndex={trade === x ? 0 : -1} className="ds-chip flex-none" onClick={() => choose(x)} onKeyDown={e => pickKeys(e, x)}
                    style={{ ['--dot' as string]: TRADE_COLORS[x][0] }}>
                    <span className="ds-chip-dot" aria-hidden="true" />{tx(`ind.${TRADE_INFO[x].industry}`)}
                  </button>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.08} className="order-1 md:order-2">
              <h1 id="hero-h" className="ds-display text-[clamp(40px,6.2vw,84px)]">{t('home.title')}</h1>
            </Reveal>
            <Reveal delay={0.16} className="order-3">
              <p className="ds-lead max-w-[36em]">{tx('lp.sub', platform, staffWord)}</p>
            </Reveal>
            <Reveal delay={0.24} className="order-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button href={start} variant="primary" size="lg" magnetic>{t('home.cta')}</Button>
                {!loggedIn && <Button href="/login" variant="glass" size="lg">{t('home.login')}</Button>}
              </div>
            </Reveal>
            <Reveal delay={0.3} className="order-5"><p className="text-[14px] ds-muted">{t('home.note')}</p></Reveal>
          </div>
          <div ref={artRef} className="relative order-1 h-[30svh] min-h-[220px] md:order-2 md:h-[70svh]">
            <motion.div key={trade} initial={calm ? false : { opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              className="absolute bottom-2 right-0 md:bottom-[12%] md:right-[4%]">
              <Glass breathe className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--ds-ok)' }} /><span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: 'var(--ds-ok)' }} /></span>
                <span><b>{L(info.caption)}</b><span className="ml-2 ds-muted">{t('lp.sample')}</span></span>
              </Glass>
            </motion.div>
          </div>
          <a href="#live" className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-[13px] no-underline md:flex" style={{ color: 'var(--ds-muted)' }}>
            {t('lp.scroll')}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </a>
        </section>

        {/* ---------- the glitter gathers into the calendar */}
        <section id="live" ref={calRef} aria-labelledby="live-h" className="relative" style={{ height: '240svh' }}>
          <div className="sticky top-0 flex h-[100svh] items-center">
            <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-4 sm:px-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <h2 id="live-h" className="ds-display text-[clamp(32px,4.2vw,56px)]">{t('lp.calT')}</h2>
                <p className="ds-lead max-w-[34em]">{t('lp.calD')}</p>
                <Glass className="flex items-center gap-3 self-start !rounded-full px-4 py-2.5 text-[14px]" aria-live="polite">
                  <span className="h-2 w-2 rounded-full" style={{ background: info.staff[latest.col].color }} aria-hidden="true" />
                  {shown > 0 ? tx('lp.ticker', L(latest.who), `${L(info.staff[latest.col].name)} · ${L(latest.what)}`) : t('lp.sample')}
                </Glass>
              </div>
              <WeekCalendar figRef={figRef} trade={trade} shown={shown} calm={calm} label={t('lp.calLabel')} L={L} />
            </div>
          </div>
        </section>

        {/* ---------- the tools, as the product shows them */}
        <section id="features" aria-labelledby="feat-h" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-36">
          <Reveal><h2 id="feat-h" className="ds-display max-w-[16em] text-[clamp(32px,4.2vw,56px)]">{t('lp.featT')}</h2></Reveal>
          <Reveal delay={0.06}><p className="ds-lead mt-4 max-w-[34em]">{t('lp.featD')}</p></Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-12">
            <Reveal className="md:col-span-7 md:row-span-2"><Special trade={trade} L={L} tx={tx} lang={lang} /></Reveal>
            <Reveal className="md:col-span-5" delay={0.05}>
              <Card title={t('home.f2t')} body={t('home.f2d')}>
                <div className="flex flex-col gap-2" data-ui>
                  {info.staff.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px]">
                      <span className="grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: s.color }}>{L(s.name).slice(0, 1)}</span>
                      <b className="w-14 truncate">{L(s.name)}</b>
                      {info.skills.filter((_, k) => (k + i) % 3 !== 2).map((k, j) => <span key={j} className="rounded-full px-2 py-0.5 text-[12px]" style={{ background: 'var(--ds-glass-strong)' }}>{L(k)}</span>)}
                    </div>
                  ))}
                  <p className="mt-1 text-[13px]" style={{ color: 'var(--ds-accent-strong)' }}>{t('lp.anyStaff')}</p>
                </div>
              </Card>
            </Reveal>
            <Reveal className="md:col-span-5" delay={0.1}>
              <Card title={t('home.f3t')} body={t('home.f3d')}>
                <div className="flex items-center gap-3" data-ui>
                  <div className="flex -space-x-2">{['#C8445A', '#8E5BA8', '#2F8A78'].map(c => <span key={c} className="h-9 w-9 rounded-full ring-2 ring-[#07060b]" style={{ background: c }} />)}</div>
                  <span className="text-[13px]"><b className="tabular-nums">14:00</b> · {t('lp.sameTime')}</span>
                </div>
              </Card>
            </Reveal>
            <Reveal className="md:col-span-4" delay={0.05}>
              <Card title={t('home.f4t')} body={t('home.f4d')}>
                <div className="flex flex-col gap-2 rounded-xl p-3 text-[13px]" style={{ background: 'rgba(7,6,11,.45)', border: '1px solid var(--ds-edge)' }} data-ui>
                  <span className="ds-muted">{t('lp.manageCard')}</span>
                  <b>{L(info.bookings[0].what)} · {L(info.staff[0].name)} · <span className="tabular-nums">{lang === 'zh' ? '周六 14:00' : 'Sat 2:00 pm'}</span></b>
                  <div className="flex gap-2"><span className="ds-btn ds-btn-sm ds-btn-secondary">{t('lp.reschedule')}</span><span className="ds-btn ds-btn-sm ds-btn-ghost">{t('lp.cancel')}</span></div>
                  <span className="text-[12px] ds-muted">{t('lp.manageNote')}</span>
                </div>
              </Card>
            </Reveal>
            <Reveal className="md:col-span-4" delay={0.1}>
              <Card title={t('home.f5t')} body={t('home.f5d')}>
                <div className="flex flex-col gap-1.5" data-ui aria-hidden="true">
                  {[[2, 7], [1, 6], [3, 8], [0, 5], [2, 8], [1, 9], [4, 9]].map(([a, b], i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] ds-muted">
                      <span className="w-6">{(lang === 'zh' ? '一二三四五六日' : 'MTWTFSS')[i]}</span>
                      <span className="relative h-2.5 flex-1 rounded-full" style={{ background: 'rgba(255,255,255,.06)' }}>
                        <span className="absolute inset-y-0 rounded-full" style={{ left: `${a * 10}%`, width: `${(b - a) * 10}%`, background: `linear-gradient(90deg, ${TRADE_COLORS[trade][0]}, ${TRADE_COLORS[trade][1]})` }} />
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>
            <Reveal className="md:col-span-4" delay={0.15}>
              <Card title={t('home.f6t')} body={t('home.f6d')}>
                <div className="flex items-end gap-3" data-ui aria-hidden="true">
                  {info.staff.map((s, i) => { const v = [32, 24, 28, 18][i]; return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[11px] tabular-nums ds-muted">{v}</span>
                      <motion.span className="w-full rounded-t-md" style={{ background: s.color, opacity: 0.85 }} initial={calm ? false : { height: 0 }} whileInView={{ height: v * 2.4 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 90, damping: 16, delay: i * 0.08 }} />
                      <span className="w-full truncate text-center text-[11px]">{L(s.name)}</span>
                    </div>) })}
                </div>
                <p className="mt-2 text-[12px] ds-muted">{t('lp.weekDone')} · {t('lp.sample')}</p>
              </Card>
            </Reveal>
          </div>
        </section>

        {/* ---------- open in three steps */}
        <section id="steps" aria-labelledby="steps-h" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 md:pb-36">
          <Reveal><h2 id="steps-h" className="ds-display text-[clamp(32px,4.2vw,56px)]">{t('lp.stepsT')}</h2></Reveal>
          <ol className="relative mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            <span aria-hidden="true" className="absolute left-0 right-0 top-[34px] hidden h-px md:block" style={{ background: 'linear-gradient(90deg, transparent, var(--ds-accent), var(--ds-gold), transparent)' }} />
            {([['home.h1t', 'home.h1d'], ['home.h2t', 'home.h2d'], ['home.h3t', 'home.h3d']] as const).map(([h, d], i) => (
              <Reveal key={h} as="li" delay={i * 0.1}>
                <Glass className="relative flex h-full flex-col gap-3 p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-full text-[17px] font-bold" style={{ background: 'var(--ds-ink)', color: 'var(--ds-accent-ink)' }}>{i + 1}</span>
                  <h3 className="text-[19px] font-bold">{t(h)}</h3>
                  <p className="text-[15px] leading-relaxed" style={{ color: 'var(--ds-ink-2)' }}>{t(d)}</p>
                </Glass>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ---------- close */}
        <section ref={endRef} aria-labelledby="end-h" className="relative mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 pb-24 pt-10 text-center sm:px-6 md:pb-32">
          <Reveal><p ref={markRef} aria-hidden="true" className="ds-display ds-gradient-text select-none text-[clamp(84px,17vw,240px)] leading-none">{platform}</p></Reveal>
          <Reveal delay={0.06}><h2 id="end-h" className="ds-display text-[clamp(26px,3vw,40px)]">{t('lp.endT')}</h2></Reveal>
          <Reveal delay={0.12}><p className="ds-lead max-w-[34em]">{t('lp.endD')}</p></Reveal>
          <Reveal delay={0.18}><Button href={start} variant="primary" size="lg" magnetic>{t('home.cta')}</Button></Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap gap-4 px-4 py-8 text-[13px] sm:px-6" style={{ color: 'var(--ds-muted)', borderTop: '1px solid var(--ds-edge)' }}>
        <span className="font-semibold" style={{ color: 'var(--ds-ink)' }}>{platform}</span><span>{t('home.footer')}</span>
      </footer>
    </div>
    </MotionConfig>
  )
}

function Card({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <Tilt className="ds-glass relative flex h-full flex-col gap-4 p-6">
      <div><h3 className="text-[18px] font-bold">{title}</h3><p className="mt-1 text-[14.5px] leading-relaxed" style={{ color: 'var(--ds-ink-2)' }}>{body}</p></div>
      <div className="mt-auto">{children}</div>
    </Tilt>
  )
}

function Special({ trade, L, tx, lang }: { trade: Trade; L: (x: { zh: string; en: string }) => string; tx: (k: string, ...a: Array<string | number>) => string; lang: string }) {
  const info = TRADE_INFO[trade]
  if (info.special === 'tryon') {
    return (
      <Tilt className="ds-glass relative grid h-full min-h-[380px] grid-cols-1 overflow-hidden sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 p-6 sm:p-8">
          <h3 className="ds-display text-[28px]">{tx('lp.tryonT')}</h3>
          <p className="text-[15px] leading-relaxed" style={{ color: 'var(--ds-ink-2)' }}>{tx('lp.tryonD')}</p>
          <ul className="mt-auto flex flex-wrap gap-1.5" aria-label={tx('lp.sample')}>
            {(lang === 'zh' ? LOOKS_ZH : LOOKS_EN).map(n => <li key={n} className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: 'var(--ds-glass-strong)' }}>{n}</li>)}
          </ul>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/tryon.jpg" alt={lang === 'zh' ? '在真实的手上试月光猫眼' : 'Moonlight cat-eye tried on a real hand'} className="h-full min-h-[260px] w-full object-cover" />
      </Tilt>
    )
  }
  if (info.special === 'hair') {
    return (
      <Tilt className="ds-glass relative flex h-full min-h-[380px] flex-col gap-4 p-6 sm:p-8">
        <h3 className="ds-display text-[28px]">{tx('lp.hairT')}</h3>
        <p className="max-w-[30em] text-[15px] leading-relaxed" style={{ color: 'var(--ds-ink-2)' }}>{tx('lp.hairD')}</p>
        <ul className="mt-auto grid grid-cols-3 gap-3" data-ui>
          {HAIR_SHADES.map(s => (
            <li key={s.hex} className="flex flex-col gap-2">
              <span className="block h-20 rounded-2xl" style={{ background: `linear-gradient(160deg, ${s.hex}, color-mix(in srgb, ${s.hex} 55%, black))`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.25)' }} />
              <span className="text-[13px]">{L(s.name)}</span>
            </li>
          ))}
        </ul>
      </Tilt>
    )
  }
  return (
    <Tilt className="ds-glass relative flex h-full min-h-[380px] flex-col gap-4 p-6 sm:p-8">
      <h3 className="ds-display text-[28px]">{tx('lp.prefsT')}</h3>
      <p className="max-w-[30em] text-[15px] leading-relaxed" style={{ color: 'var(--ds-ink-2)' }}>{tx('lp.prefsD')}</p>
      <div className="mt-auto rounded-2xl p-5" style={{ background: 'rgba(7,6,11,.5)', border: '1px solid var(--ds-edge)' }} data-ui>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full text-[15px] font-bold text-white" style={{ background: info.staff[0].color }}>{L(info.bookings[0].who).slice(0, 1)}</span>
          <div><b>{L(info.bookings[0].who)}</b><span className="ml-2 text-[12px] ds-muted">{tx('lp.sample')}</span></div>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {info.prefs!.map(p => <li key={p.zh} className="rounded-xl px-3 py-2 text-[13.5px]" style={{ background: 'var(--ds-glass-strong)' }}>{L(p)}</li>)}
        </ul>
      </div>
    </Tilt>
  )
}

const HOURS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00']

function WeekCalendar({ figRef, trade, shown, calm, label, L }: { figRef: React.Ref<HTMLElement>; trade: Trade; shown: number; calm: boolean; label: string; L: (x: { zh: string; en: string }) => string }) {
  const info = TRADE_INFO[trade]
  const rh = 34
  const visible = useMemo(() => info.bookings.slice(0, shown), [info, shown])
  return (
    <figure ref={figRef} aria-label={label} className="m-0 min-w-0" style={{ perspective: '1400px' }}>
      <Glass strong className="overflow-hidden p-3 sm:p-4" style={{ transform: calm ? undefined : 'rotateY(-12deg) rotateX(7deg)', transformOrigin: '60% 50%' }}>
        <div className="grid grid-cols-[44px_repeat(4,minmax(0,1fr))] gap-1.5 pb-2 text-[12.5px] font-bold">
          <span />
          {info.staff.map((s, i) => <span key={i} className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 flex-none rounded-full" style={{ background: s.color }} /><span className="truncate">{L(s.name)}</span></span>)}
        </div>
        <div className="relative grid grid-cols-[44px_repeat(4,minmax(0,1fr))] gap-1.5">
          <div className="flex flex-col">{HOURS.map(h => <span key={h} className="text-[11px] tabular-nums ds-muted" style={{ height: rh * 2 }}>{h}</span>)}</div>
          {[0, 1, 2, 3].map(c => (
            <div key={c} className="relative rounded-lg" style={{ height: rh * 12, background: 'repeating-linear-gradient(180deg, rgba(255,255,255,.045) 0 1px, transparent 1px ' + rh + 'px)' }}>
              {visible.filter(b => b.col === c).map((b: Booking) => (
                <motion.div key={`${trade}-${b.start}`} data-booking className="absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight"
                  style={{ top: b.start * rh + 1, height: b.len * rh - 3, background: `color-mix(in srgb, ${info.staff[c].color} 78%, black)`, boxShadow: `0 6px 20px -8px ${info.staff[c].color}` }}
                  initial={calm ? false : { opacity: 0, scale: 0.6, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }}>
                  <b className="block truncate">{L(b.who)}</b><span className="block truncate opacity-85">{L(b.what)}</span>
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </Glass>
    </figure>
  )
}
