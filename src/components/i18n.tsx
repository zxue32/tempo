'use client'
import { createContext, useContext, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { makeT, type T } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: 'zh', t: makeT('zh') })

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, t } = useI18n()
  const router = useRouter()
  return (
    <button
      type="button"
      className={className || 'btn btn-sm btn-ghost'}
      onClick={() => {
        document.cookie = `lang=${lang === 'zh' ? 'en' : 'zh'}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
      aria-label="Language / 语言"
    >
      {t('c.lang')}
    </button>
  )
}
