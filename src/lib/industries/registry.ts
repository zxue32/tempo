// The ten industries the platform serves, registered in trusted code only (CORE-02).
// Display names and pictures live elsewhere (i18n `ind.*`, the landing sculptures); this file holds the
// business facts: which capabilities an industry needs for its full launch, and which ones are switched on.
// Switching a capability on is a server-side decision: hiding a button is not the same as disabling it.

/** Building blocks shared by every industry. Only `appointment` and `design_snapshot` exist today. */
export const CAPABILITIES = [
  'appointment',        // book a time with a staff member (the current booking engine)
  'multi_resource',     // several rooms / chairs / machines per service, cleaning time
  'staged_service',     // processing time where the staff member is free (hair colour, pet drying)
  'consultation_quote', // request → review → quote → accept before a time is booked
  'design_snapshot',    // an immutable design (the 3D nail studio) attached to the booking
  'subject_profile',    // the person or pet served is not the person booking
  'class_enrollment',   // seats in a class session with a waitlist
  'entitlement_ledger', // class packs and memberships
  'recurring_schedule', // a weekly series in local time
  'queue',              // walk-in queue mixed with appointments
  'project_sessions',   // one project delivered over several sessions (tattoo)
] as const
export type Capability = (typeof CAPABILITIES)[number]

export const INDUSTRY_KEYS = ['nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'other'] as const
export type IndustryKey = (typeof INDUSTRY_KEYS)[number]

export type IndustryDef = {
  key: IndustryKey
  /** The key used in the ten-industry execution plan (kept as an alias; the data keeps `key`). */
  planKey: string
  /** How a client mainly books once the industry is fully launched. */
  bookingMode: 'appointment' | 'queue' | 'class' | 'project'
  serviceTemplateVersion: number
  /** Capabilities the industry needs for its full launch (its P0 requirements). */
  requires: readonly Capability[]
  /** Capabilities switched on for this industry right now. Always a subset of `requires`. */
  enabled: readonly Capability[]
}

const def = (key: IndustryKey, planKey: string, bookingMode: IndustryDef['bookingMode'], requires: Capability[], enabled: Capability[] = ['appointment']): IndustryDef =>
  ({ key, planKey, bookingMode, serviceTemplateVersion: 1, requires, enabled })

export const REGISTRY: Record<IndustryKey, IndustryDef> = {
  nail: def('nail', 'nails', 'appointment', ['appointment', 'design_snapshot', 'consultation_quote', 'multi_resource'], ['appointment', 'design_snapshot']),
  hair: def('hair', 'hair_salon', 'appointment', ['appointment', 'staged_service', 'multi_resource', 'consultation_quote']),
  barber: def('barber', 'barber', 'queue', ['appointment', 'queue', 'multi_resource']),
  spa: def('spa', 'spa', 'appointment', ['appointment', 'multi_resource', 'staged_service']),
  beauty: def('beauty', 'lash_beauty', 'appointment', ['appointment', 'consultation_quote', 'multi_resource']),
  tattoo: def('tattoo', 'tattoo', 'project', ['appointment', 'consultation_quote', 'project_sessions']),
  pet: def('pet', 'pet_grooming', 'appointment', ['appointment', 'subject_profile', 'staged_service']),
  pilates: def('pilates', 'pilates', 'class', ['appointment', 'class_enrollment', 'entitlement_ledger', 'recurring_schedule']),
  fitness: def('fitness', 'personal_training', 'appointment', ['appointment', 'entitlement_ledger', 'recurring_schedule']),
  other: def('other', 'other', 'appointment', ['appointment']),
}

export const isIndustryKey = (v: unknown): v is IndustryKey => typeof v === 'string' && (INDUSTRY_KEYS as readonly string[]).includes(v)

/** The plan's industry key (or one of ours) → the key stored in the data. */
export function fromPlanKey(k: string): IndustryKey | null {
  if (isIndustryKey(k)) return k
  return INDUSTRY_KEYS.find(x => REGISTRY[x].planKey === k) ?? null
}

/** A shop's legacy single `industry` value → its industries. `both` was nails + barber, never "other". */
export function legacyToIndustries(legacy: string): IndustryKey[] {
  if (legacy === 'both') return ['nail', 'barber']
  return isIndustryKey(legacy) ? [legacy] : []
}

export function industryAllows(k: IndustryKey, cap: Capability, reg: Record<IndustryKey, IndustryDef> = REGISTRY): boolean {
  return reg[k]?.enabled.includes(cap) ?? false
}

/** A shop can use a capability only through one of its own industries. */
export function shopAllows(industries: readonly IndustryKey[], cap: Capability, reg: Record<IndustryKey, IndustryDef> = REGISTRY): boolean {
  return industries.some(k => industryAllows(k, cap, reg))
}

/** Why a service can't be booked online in this shop, or null if it can. Services not yet tagged with an
    industry fall back to the shop's own industries. */
export function unbookableReason(shopIndustries: readonly IndustryKey[], serviceIndustry: string | null, reg: Record<IndustryKey, IndustryDef> = REGISTRY): 'CAPABILITY_DISABLED' | null {
  if (serviceIndustry == null) return shopAllows(shopIndustries, 'appointment', reg) ? null : 'CAPABILITY_DISABLED'
  if (!isIndustryKey(serviceIndustry) || !shopIndustries.includes(serviceIndustry)) return 'CAPABILITY_DISABLED'
  return industryAllows(serviceIndustry, 'appointment', reg) ? null : 'CAPABILITY_DISABLED'
}
