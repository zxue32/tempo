// Client segments the CRM computes (no table): shared by server code and the dashboard's client components.
export const SEGMENTS = ['all', 'new', 'regular', 'lapsed', 'vip', 'no_show', 'upcoming', 'birthday', 'consented'] as const
export type Segment = (typeof SEGMENTS)[number]
export const isSegment = (v: unknown): v is Segment => typeof v === 'string' && (SEGMENTS as readonly string[]).includes(v)
export type CampaignSegment = { segment: Segment; tag?: string }
