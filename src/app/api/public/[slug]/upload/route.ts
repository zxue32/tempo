import { getShopBySlug } from '@/lib/data/shops'
import { storeImage, UploadError } from '@/lib/storage'
import { json } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'
import { logError } from '@/lib/log'

// Customer reference photo for a booking (or the 3D studio's design card). Private: only the shop's own people
// can open it (CORE-04).
export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/upload'>) {
  const { slug } = await ctx.params
  const shop = await getShopBySlug(slug)
  if (!shop || shop.status !== 'live') return json({ error: 'not_open' }, 403)
  if (!(await allow('up:' + (await clientKey()), 10, 3600))) return json({ error: 'rate' }, 429)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return json({ error: 'invalid' }, 400)
  try {
    const url = await storeImage(file, `ref/${shop.id}`, { visibility: 'private' })
    return json({ url })
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.message }, 400)
    logError('upload', e)
    return json({ error: 'server' }, 500)
  }
}
