import 'server-only'
import { cookies, headers } from 'next/headers'
import { makeT, isLang } from './index'
import type { Lang } from '../types'

/** Language for this request: the visitor's choice, then their browser, then the fallback. */
export async function getLang(fallback: Lang = 'zh'): Promise<Lang> {
  const c = (await cookies()).get('lang')?.value
  if (isLang(c)) return c
  const al = (await headers()).get('accept-language') || ''
  if (/^\s*zh/i.test(al)) return 'zh'
  if (/^\s*en/i.test(al)) return 'en'
  return fallback
}

export async function getT(fallback: Lang = 'zh') {
  const lang = await getLang(fallback)
  return { lang, t: makeT(lang) }
}
