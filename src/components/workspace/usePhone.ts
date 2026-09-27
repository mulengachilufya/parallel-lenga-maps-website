'use client'

/**
 * True on phones (narrow screens, and small touch screens held either
 * way). The workspace uses it to switch to phone view: look, comment and
 * leave voice notes, but no changes to the project itself.
 */

import { useEffect, useState } from 'react'

const QUERY = '(max-width: 760px), ((pointer: coarse) and (max-width: 1024px) and (max-height: 600px))'

export function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const update = () => setPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return phone
}
