import type { Lang, Preferences, Staff } from '@/lib/types'
import { pick } from '@/lib/i18n'
import { DEFAULT_NAIL_COLORS, NailIcon } from './NailArt'

type Tf = (key: string, ...args: Array<string | number>) => string
export type ColorName = { hex: string; name: string; nameZh?: string | null }

/** Name for a stored colour: the shop's palette first, then the built-in list, else the hex itself. */
export function colorLabel(hex: string, lang: Lang, palette: ColorName[] = []): string {
  const h = hex.toUpperCase()
  const hit = palette.find(c => c.hex.toUpperCase() === h) ?? DEFAULT_NAIL_COLORS.find(c => c.hex.toUpperCase() === h)
  return hit ? pick(lang, hit.name, hit.nameZh ?? null) : hex
}

/**
 * A client's preference card as a row of chips — what they usually like.
 * Plain component (no hooks) so the calendar, My day and the customer page can all show it.
 */
export function PrefChips({ prefs, staff, palette = [], t, lang, size = 'md' }: {
  prefs: Preferences; staff: Pick<Staff, 'id' | 'name' | 'nameZh' | 'color'>[]; palette?: ColorName[]; t: Tf; lang: Lang; size?: 'sm' | 'md'
}) {
  const who = prefs.staffId ? staff.find(s => s.id === prefs.staffId) : null
  const cls = size === 'sm' ? 'chip !h-auto gap-1.5 py-0.5 text-[12px]' : 'chip !h-auto gap-1.5 py-1 text-[13px]'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {(prefs.colors ?? []).map(hex => (
          <span key={hex} className={cls}><span className="h-3.5 w-3.5 flex-none rounded-full border border-black/10" style={{ background: hex }} />{colorLabel(hex, lang, palette)}</span>
        ))}
        {prefs.shape && <span className={cls}><NailIcon shape={prefs.shape} length={prefs.length ?? 'medium'} color={prefs.colors?.[0] ?? '#E8B4B8'} size={16} />{t(`nd.shape.${prefs.shape}`)}</span>}
        {prefs.length && <span className={cls}>{t('nd.lengthT')} · {t(`nd.length.${prefs.length}`)}</span>}
        {prefs.finish && <span className={cls}>{t(`nd.finish.${prefs.finish}`)}</span>}
        {(prefs.styles ?? []).map(s => <span key={s} className={cls}>{t(`tag.${s}`)}</span>)}
        {prefs.hairColor && <span className={cls}>{t('pl.hair')} · {prefs.hairColor}</span>}
        {prefs.hairStyle && <span className={cls}>{t('pc.hairStyle')} · {prefs.hairStyle}</span>}
        {who && <span className={cls}><span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: who.color }} />{t('pc.usually')} {pick(lang, who.name, who.nameZh)}</span>}
      </div>
      {prefs.notes && <p className={`whitespace-pre-wrap ${size === 'sm' ? 'text-[12.5px]' : 'text-[13.5px]'} text-muted`}>{prefs.notes}</p>}
    </div>
  )
}
