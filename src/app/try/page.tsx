import { env } from '@/lib/env'
import { TryStudio } from './TryStudio'

export const metadata = { title: `3D 试色台 · ${env.platformName}` }

/** The 3D nail studio on its own, for shop owners to try from the front page (no shop, no booking). */
export default function TryPage() {
  return <TryStudio platform={env.platformName} />
}
