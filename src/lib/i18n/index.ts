import { zh, type DictKey } from './zh'
import { en } from './en'
import type { Lang } from '../types'

export type { DictKey }
export const dicts: Record<Lang, Record<DictKey, string>> = { zh, en }

export type T = (key: DictKey, ...args: Array<string | number>) => string

export function makeT(lang: Lang): T {
  const d = dicts[lang] ?? dicts.en
  return (key, ...args) => {
    let s = d[key] ?? dicts.en[key] ?? key
    args.forEach((a, i) => { s = s.split(`{${i}}`).join(String(a)) })
    return s
  }
}

export const isLang = (v: unknown): v is Lang => v === 'zh' || v === 'en'

/** Pick zh/en version of a field pair. */
export function pick(lang: Lang, en: string | null | undefined, zh: string | null | undefined): string {
  return (lang === 'zh' ? zh || en : en || zh) || ''
}
