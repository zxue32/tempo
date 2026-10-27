import { getShopBySlug } from '@/lib/data/shops'
import { storeImage, UploadError } from '@/lib/storage'
import { json } from '@/lib/api'
import { allow, clientKey } from '@/lib/ratelimit'

// Customer reference photo for a booking.
export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/upload'>) {
  const { slug } = await ctx.params
  const shop = await getShopBySlug(slug)
  if (!shop || shop.status !== 'live') return json({ error: 'not_open' }, 403)
  if (!(await allow('up:' + (await clientKey()), 10, 3600))) return json({ error: 'rate' }, 429)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return json({ error: 'invalid' }, 400)
  try {
    const url = await storeImage(file, `ref/${shop.id}`)
    return json({ url })
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.message }, 400)
    console.error(e)
    return json({ error: 'server' }, 500)
  }
}
