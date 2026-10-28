import { getUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { Landing } from '@/components/landing/Landing'
import '@fontsource-variable/noto-serif-sc'
import '@/styles/ds.css'

export const metadata = { title: `${env.platformName} · 预约制店铺的预约平台` }

export default async function Home() {
  const user = await getUser().catch(() => null)
  return (
    <>
      <Landing loggedIn={!!user} platform={env.platformName} />
    </>
  )
}
