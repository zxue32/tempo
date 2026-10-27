'use client'
import { useState, useTransition } from 'react'
import { useI18n } from '@/components/i18n'
import { fmtTime } from '@/lib/tz'
import type { DictKey } from '@/lib/i18n'
import type { ReplayResult } from '@/lib/replay'
import { replayAction } from '../actions'

export function Replay({ shopId, example }: { shopId: string; example: string }) {
  const { t, lang } = useI18n()
  const [csv, setCsv] = useState('')
  const [res, setRes] = useState<ReplayResult | null>(null)
  const [pending, start] = useTransition()
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent('﻿date,start,end,staff,services\n' + example)}`
  const run = () => start(async () => {
    const r = await replayAction(shopId, csv)
    setRes(r.ok ? r.result : null)
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm" href={template} download="paper-book-template.csv">{t('rpl.template')}</a>
        <label className="btn btn-sm cursor-pointer">{t('rpl.openFile')}<input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} /></label>
      </div>
      <textarea aria-label={t('rpl.paste')} className="inp font-mono text-[12.5px]" rows={6} value={csv} onChange={e => setCsv(e.target.value)} placeholder={'date,start,end,staff,services\n' + example} />
      <button className="btn btn-primary btn-sm self-start" disabled={pending || !csv.trim()} onClick={run}>{pending ? '…' : t('rpl.run')}</button>
      {res && (
        <div className="flex flex-col gap-3" role="status">
          <p className={`text-[15px] font-semibold ${res.problems.length ? 'text-warn' : 'text-ok'}`}>
            {res.problems.length ? t('rpl.someDont', res.fit, res.total) : '✓ ' + t('rpl.allFit', res.total)}
          </p>
          {res.usedDefaultRoster.length > 0 && <p className="text-[13px] text-muted">{t('rpl.defaultRoster', res.usedDefaultRoster.length)}</p>}
          {res.problems.length > 0 && (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>{t('rpl.line')}</th><th>{t('c.date')}</th><th>{t('c.time')}</th><th>{t('rp.colStaff')}</th><th>{t('bl.colServices')}</th><th>{t('rpl.why')}</th></tr></thead>
                <tbody>
                  {res.problems.slice(0, 200).map(p => (
                    <tr key={p.line}>
                      <td className="tnum">{p.line}</td><td className="tnum">{p.date}</td><td className="tnum">{fmtTime(p.start, lang)}</td><td>{p.staff}</td><td>{p.services}</td>
                      <td>{t(`rpl.w.${p.why}` as DictKey)}{p.detail ? `: ${p.detail}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {res.durations.length > 0 && (
            <>
              <b className="text-[14px]">{t('rpl.durations')}</b>
              <ul className="flex flex-col gap-1 text-[13.5px]">
                {res.durations.slice(0, 50).map(d => <li key={d.line}>{t('rpl.durationRow', d.line, d.staff, d.service, d.booked, d.actual)}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
