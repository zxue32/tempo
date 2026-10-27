import Link from 'next/link'
import { PlatformMark } from '@/components/ui'
import { LangToggle } from '@/components/i18n'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="text-ink no-underline"><PlatformMark /></Link>
        <LangToggle />
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:pt-14">{children}</main>
    </div>
  )
}
