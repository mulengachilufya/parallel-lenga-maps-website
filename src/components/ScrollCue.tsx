'use client'

/**
 * "Keep scrolling" cue: bottom left on desktop (the empty corner of the
 * diagonal layout), centred on phones until the first scroll; fades out
 * near the end of the page.
 */

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function ScrollCue({ label = 'Keep scrolling' }: { label?: string }) {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const on = () => {
      const nearEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - window.innerHeight * 1.2
      // On phones the cue would sit on card text: show it only before the first scroll.
      const phoneScrolled = window.innerWidth < 768 && window.scrollY > 200
      setShow(!nearEnd && !phoneScrolled)
    }
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])
  return (
    <div aria-hidden className={`pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 md:left-8 md:translate-x-0 transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex flex-col items-center gap-0.5 rounded-full bg-[#06101a]/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75 backdrop-blur">
        {label}
        <ChevronDown size={16} className="animate-bounce text-[#F5B800]" />
      </div>
    </div>
  )
}
