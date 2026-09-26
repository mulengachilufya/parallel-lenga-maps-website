'use client'

/**
 * Live unread count for the title bar: loads it once, then listens for new
 * direct messages to the signed-in user over Realtime (RLS limits the feed
 * to their own conversations).
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { WsDirectMessage } from '@/lib/workspace/types'

export function useInbox(): { unread: number; latest: WsDirectMessage | null } {
  const [unread, setUnread] = useState(0)
  const [latest, setLatest] = useState<WsDirectMessage | null>(null)

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const load = () => fetch('/api/workspace/dms').then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setUnread(d.unread_total ?? 0) }).catch(() => {})

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      await load()
      channel = supabase.channel(`ws-inbox-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_direct_messages', filter: `recipient_id=eq.${user.id}` },
          (payload) => { setLatest(payload.new as WsDirectMessage); setUnread((n) => n + 1) })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_direct_messages', filter: `recipient_id=eq.${user.id}` },
          () => void load())
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel) }
  }, [])

  return { unread, latest }
}
