// Industry filter for every place datasets are listed (catalogue page, dashboard rail).
// A dataset can serve several industries; keys are catalogue ids from DATASETS (src/lib/supabase.ts).

export interface Industry { key: string; label: string; ids: number[] }

export const INDUSTRIES: Industry[] = [
  { key: 'agriculture', label: 'Agriculture & food', ids: [24, 18, 20, 11, 15, 16, 5, 4, 6, 3, 8] },
  { key: 'energy',      label: 'Energy',             ids: [22, 23, 21, 15, 3, 9, 8, 12] },
  { key: 'mining',      label: 'Mining & geology',   ids: [21, 9, 23, 12, 3, 6, 1] },
  { key: 'water',       label: 'Water & climate',    ids: [15, 16, 5, 3, 13, 14, 17, 6] },
  { key: 'environment', label: 'Environment & carbon', ids: [19, 12, 4, 11, 20, 17, 14, 16] },
  { key: 'infrastructure', label: 'Infrastructure & transport', ids: [9, 23, 21, 8, 1, 22] },
  { key: 'planning',    label: 'Planning, health & NGOs', ids: [8, 1, 9, 15, 5, 18, 24, 12] },
]

/** Datasets in an industry; 'all' (or an unknown key) keeps everything. */
export function inIndustry<T extends { id: number }>(list: T[], key: string): T[] {
  const ind = INDUSTRIES.find((i) => i.key === key)
  return ind ? list.filter((d) => ind.ids.includes(d.id)) : list
}

export function IndustryChips({ value, onChange, dark = false }: { value: string; onChange: (k: string) => void; dark?: boolean }) {
  const base = 'shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors border'
  const on = dark ? 'bg-[#F5B800] text-[#0D2B45] border-[#F5B800]' : 'bg-navy text-white border-navy'
  const off = dark ? 'bg-white/10 text-white border-white/20 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filter datasets by industry">
      {[{ key: 'all', label: 'All industries' }, ...INDUSTRIES].map((i) => (
        <button key={i.key} type="button" role="tab" aria-selected={value === i.key}
          onClick={() => onChange(i.key)} className={`${base} ${value === i.key ? on : off}`}>
          {i.label}
        </button>
      ))}
    </div>
  )
}
