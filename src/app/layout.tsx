import type { Metadata, Viewport } from 'next'
import './globals.css'
import { getLang } from '@/lib/i18n/server'
import { I18nProvider } from '@/components/i18n'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: { default: `${env.platformName} · 预约`, template: `%s · ${env.platformName}` },
  description: 'Online booking for nail salons and barbershops',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F3F4F6' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang()
  return (
    <html lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  )
}
