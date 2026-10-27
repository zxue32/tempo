export type Lang = 'zh' | 'en'
export type Industry = 'nail' | 'barber' | 'both'
export type ShopStatus = 'draft' | 'pending' | 'changes' | 'live' | 'rejected' | 'suspended'
export type DayHours = { closed: boolean; open: number; close: number }
export type Hours = Record<string, DayHours>
export type Break = [number, number]

export type Shop = {
  id: string
  slug: string
  status: ShopStatus
  industry: Industry
  name: string
  nameZh: string | null
  aboutEn: string | null
  aboutZh: string | null
  theme: string
  accent: string | null
  logoUrl: string | null
  coverUrl: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  mapUrl: string | null
  instagram: string | null
  timezone: string
  defaultLang: Lang
  hours: Hours
  slotMinutes: number
  leadMinutes: number
  maxDays: number
  cancelCutoffMinutes: number
  bufferMinutes: number
  maxGuests: number
  allowAnyStaff: boolean
  showPrices: boolean
  bookingNoteEn: string | null
  bookingNoteZh: string | null
  notifyEmails: string[]
  notifyStaff: boolean
  walkinReserve: number
  assignMode: 'balanced' | 'turns'
  turnsCountRequests: boolean
  minGap: number
  noshowLimit: number
  waitlistEnabled: boolean
  pilotBaseline: PilotBaseline
  inviteCode: string | null
  reviewNote: string | null
  submittedAt: Date | null
  reviewedAt: Date | null
  liveAt: Date | null
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

export type Staff = {
  id: string
  shopId: string
  name: string
  nameZh: string | null
  bioEn: string | null
  bioZh: string | null
  color: string
  photoUrl: string | null
  active: boolean
  bookableOnline: boolean
  commissionPct: number
  sort: number
  defaultWeek: Record<string, { start: number; end: number; breaks: Break[] }>
  publicPage: boolean
  specialties: string[]
  specialtiesZh: string[]
}

/** A shop-managed colour swatch: hair dye shades or nail polish colours. */
export type Swatch = {
  id: string; shopId: string; kind: 'hair' | 'nail'; name: string; nameZh: string | null; code: string | null
  hex: string; hex2: string | null; photoUrl: string | null; sort: number; active: boolean
}

/** Filters on a gallery photo. */
export type GalleryTags = { length?: 'short' | 'medium' | 'long'; style?: string[]; colorId?: string }

/** What a client designed in "design your nails"; rendered by NailArt. */
export type NailDesign = {
  shape: 'round' | 'square' | 'squoval' | 'almond' | 'coffin' | 'stiletto'
  length: 'short' | 'medium' | 'long'
  color: string          // hex
  color2?: string | null // accent / french tip / ombre end
  finish: 'glossy' | 'matte' | 'chrome' | 'glitter'
  art: 'plain' | 'french' | 'ombre' | 'dots' | 'line' | 'accent' | 'marble'
  colorName?: string | null
}

/** Structured client preferences kept by the shop. */
export type Preferences = {
  colors?: string[]; shape?: NailDesign['shape']; length?: NailDesign['length']; finish?: NailDesign['finish']; styles?: string[]
  hairColor?: string; hairStyle?: string; staffId?: string | null; notes?: string
}

export type Service = {
  id: string
  shopId: string
  kind: 'service' | 'addon'
  category: string
  appliesTo: string[]
  name: string
  nameZh: string | null
  descEn: string | null
  descZh: string | null
  durationMin: number
  priceCents: number | null
  priceFrom: boolean
  active: boolean
  online: boolean
  sort: number
  resourceId: string | null
  questionEn: string | null
  questionZh: string | null
}

export type Resource = { id: string; shopId: string; name: string; nameZh: string | null; quantity: number; sort: number }

export type GalleryItem = {
  id: string; shopId: string; url: string; captionEn: string | null; captionZh: string | null
  staffId: string | null; serviceId: string | null; sort: number; createdAt: Date; tags: GalleryTags
}

/** What the shop measured before going online, to compare against later. */
export type PilotBaseline = {
  from?: string
  to?: string
  noShowPct?: number | null
  callsPerDay?: number | null
  /** front desk's count after going online (the system can't see phone calls) */
  callsNow?: number | null
  onlinePct?: number | null
  idleHoursPerDay?: number | null
  notes?: string | null
  /** paper-book double run: dates checked and how many differences were found */
  checks?: Array<{ date: string; diffs: number; note?: string | null }>
}

export type Skill = { staffId: string; serviceId: string; durationMin: number | null }

export type Shift = { staffId: string; date: string; startMin: number; endMin: number; breaks: Break[] }

export type BookingStatus = 'confirmed' | 'completed' | 'no_show' | 'cancelled'
export type BookingKind = 'online' | 'walkin' | 'phone' | 'block'

export type BookingItem = { id?: string; serviceId: string | null; kind: 'service' | 'addon'; name: string; nameZh: string | null; durationMin: number; priceCents: number | null; sort: number }

export type Booking = {
  id: string
  shopId: string
  staffId: string
  customerId: string | null
  groupId: string | null
  code: string
  kind: BookingKind
  status: BookingStatus
  date: string
  startMin: number
  endMin: number
  startsAt: Date
  endsAt: Date
  busyUntil: Date
  durationMin: number
  guestName: string | null
  guestPhone: string | null
  guestEmail: string | null
  notes: string | null
  internalNote: string | null
  photoUrl: string | null
  anyStaff: boolean
  estPriceCents: number | null
  lang: Lang
  manageToken: string | null
  createdAt: Date
  cancelledAt: Date | null
  cancelledBy: 'customer' | 'shop' | null
  cancelReason: string | null
  resourceIds: string[]
  actualStart: Date | null
  actualEnd: Date | null
  clientConfirmedAt: Date | null
  reminderSentAt: Date | null
  design: NailDesign | null
  rating: number | null
  ratingNote: string | null
  ratedAt: Date | null
  items?: BookingItem[]
}
