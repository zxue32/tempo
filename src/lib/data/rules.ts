import 'server-only'
import { sql } from '../db'
import type { Resource, GalleryItem } from '../types'

// ---------------------------------------------------------------- equipment

export async function listResources(shopId: string): Promise<Resource[]> {
  return sql<Resource[]>`select * from app.resources where shop_id = ${shopId} order by sort, created_at`
}

export async function saveResource(shopId: string, id: string | null, d: { name: string; nameZh: string | null; quantity: number }): Promise<string> {
  if (id) {
    await sql`update app.resources set name = ${d.name}, name_zh = ${d.nameZh}, quantity = ${d.quantity} where id = ${id} and shop_id = ${shopId}`
    return id
  }
  const [row] = await sql<{ id: string }[]>`
    insert into app.resources (shop_id, name, name_zh, quantity, sort)
    values (${shopId}, ${d.name}, ${d.nameZh}, ${d.quantity}, (select coalesce(max(sort), -1) + 1 from app.resources where shop_id = ${shopId}))
    returning id
  `
  return row.id
}

export async function deleteResource(shopId: string, id: string) {
  await sql.begin(async tx => {
    // future bookings stop holding equipment that no longer exists
    await tx`update app.bookings set resource_ids = array_remove(resource_ids, ${id}::uuid) where shop_id = ${shopId} and ${id}::uuid = any(resource_ids)`
    await tx`delete from app.resources where id = ${id} and shop_id = ${shopId}`
  })
}

// ---------------------------------------------------------------- gallery

export const GALLERY_MAX = 80

export async function listGallery(shopId: string, opts: { staffId?: string | null; limit?: number } = {}): Promise<GalleryItem[]> {
  return sql<GalleryItem[]>`
    select * from app.gallery where shop_id = ${shopId} ${opts.staffId ? sql`and staff_id = ${opts.staffId}` : sql``}
    order by sort, created_at desc limit ${opts.limit ?? GALLERY_MAX}
  `
}

export async function addGalleryItem(shopId: string, url: string): Promise<GalleryItem | null> {
  const [row] = await sql<GalleryItem[]>`
    insert into app.gallery (shop_id, url, sort)
    select ${shopId}, ${url}, coalesce(min(sort), 0) - 1 from app.gallery where shop_id = ${shopId}
    having count(*) < ${GALLERY_MAX}
    returning *
  `
  return row ?? null
}

export async function updateGalleryItem(shopId: string, id: string, d: { captionEn: string | null; captionZh: string | null; staffId: string | null; serviceId: string | null }) {
  await sql`
    update app.gallery set caption_en = ${d.captionEn}, caption_zh = ${d.captionZh},
      staff_id = (select id from app.staff where id = ${d.staffId} and shop_id = ${shopId}),
      service_id = (select id from app.services where id = ${d.serviceId} and shop_id = ${shopId})
    where id = ${id} and shop_id = ${shopId}
  `
}

export async function deleteGalleryItem(shopId: string, id: string) {
  await sql`delete from app.gallery where id = ${id} and shop_id = ${shopId}`
}

export async function reorderGallery(shopId: string, ids: string[]) {
  await sql.begin(async tx => {
    for (let i = 0; i < ids.length; i++) await tx`update app.gallery set sort = ${i} where id = ${ids[i]} and shop_id = ${shopId}`
  })
}
