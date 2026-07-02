'use client'

/**
 * CountrySelect — searchable country combobox.
 *
 * Users type to filter but can only ever *pick* a real country from the list;
 * the committed value (what the parent receives via onChange) is always either
 * '' or an exact entry from COUNTRIES. Styled for the dark signup form but
 * driven entirely by props so it can be reused elsewhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { COUNTRIES } from '@/lib/countries'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
}

export default function CountrySelect({ value, onChange, placeholder = 'Select your country', id }: Props) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q))
  }, [query])

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // When opening, focus the search box and reset the highlight
  useEffect(() => {
    if (open) {
      setActive(0)
      setQuery('')
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  function pick(country: string) {
    onChange(country)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[active]) pick(matches[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between bg-[#0D2B45] border border-blue-900/60 rounded-xl px-4 py-3 text-sm text-left focus:outline-none focus:border-[#1E5F8E] ${
          value ? 'text-white' : 'text-blue-700'
        }`}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown size={16} className={`text-blue-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-[#112236] border border-blue-900/60 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-900/60">
            <Search size={14} className="text-blue-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onKeyDown}
              placeholder="Search countries…"
              className="w-full bg-transparent text-white placeholder-blue-700 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-4 py-2 text-sm text-blue-500">No match</li>
            )}
            {matches.map((c, i) => (
              <li key={c}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c)}
                  className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left ${
                    i === active ? 'bg-[#1E5F8E]/40 text-white' : 'text-blue-200 hover:bg-[#0D2B45]'
                  }`}
                >
                  <span className="truncate">{c}</span>
                  {value === c && <Check size={14} className="text-[#F5B800] shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
