/**
 * Sector / industry taxonomy captured at signup.
 *
 * Deliberately short — six real buyer segments for a geospatial-data platform
 * plus an "Other" escape hatch. Enough to give a useful statistic without a
 * wall of options that scares people off before they finish signing up.
 *
 * `value` is what we store in profiles.sector; `label` is what the user sees.
 * Keep these values stable — reports/segments depend on them.
 */
export interface SectorOption {
  value: string
  label: string
  hint?: string
}

export const SECTORS: SectorOption[] = [
  { value: 'private_company', label: 'Private company / consultancy', hint: 'Engineering, mining, agriculture, environmental, etc.' },
  { value: 'government',       label: 'Government', hint: 'Ministry, agency, or local authority' },
  { value: 'ngo',             label: 'NGO / non-profit' },
  { value: 'academia',        label: 'Research & academia', hint: 'University or research institute' },
  { value: 'donor_project',   label: 'Development / donor project', hint: 'UN, World Bank, GIZ-funded, etc.' },
  { value: 'individual',      label: 'Student / individual' },
  { value: 'other',           label: 'Other' },
]

const SECTOR_VALUES = new Set(SECTORS.map((s) => s.value))

export function isValidSector(value: unknown): value is string {
  return typeof value === 'string' && SECTOR_VALUES.has(value)
}

/** Human-readable label for a stored sector value (falls back to the raw value). */
export function sectorLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return SECTORS.find((s) => s.value === value)?.label ?? value
}
