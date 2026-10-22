// src/lib/sales/client.ts — shapes and small helpers for the /admin/sales pages.

import { AFRICAN_COUNTRIES } from '@/lib/workspace/templates'
import type { Stage } from './playbook'

export interface Contact {
  id: string; account_id: string; name: string; title: string | null; email: string | null
  phone?: string | null; linkedin_url: string | null; is_primary: boolean; notes?: string | null
  opted_out_at: string | null
}

export interface AccountSummary {
  id: string; name: string; country_iso3: string | null; sector: string | null; source: string
  stage: Stage; priority: number; seats_estimate: number | null; value_usd: number | null
  next_step: string | null; next_step_due: string | null; lost_reason: string | null
  nurture_until: string | null; org_id: string | null; stage_history: Record<string, string>
  stage_changed_at: string; last_touch_at: string | null; created_at: string; updated_at: string
  contact: Contact | null; contact_count: number; next_task: { title: string; due_on: string } | null
}

export interface Task {
  id: string; account_id: string; contact_id: string | null; kind: 'email' | 'linkedin' | 'call' | 'meeting' | 'other'
  title: string; template: string | null; due_on: string; sequence: boolean
  done_at?: string | null; outcome?: 'done' | 'skipped' | null
  account_name?: string; account_stage?: Stage; country_iso3?: string | null; contact?: Contact | null
}

export interface Activity {
  id: string; account_id: string; contact_id: string | null
  kind: 'email' | 'linkedin' | 'call' | 'meeting' | 'note' | 'reply' | 'stage' | 'task' | 'system'
  direction: 'out' | 'in' | null; subject: string | null; body: string | null
  meta: Record<string, unknown>; created_by: string | null; created_at: string
}

export interface Settings { focus_countries: string[]; signature: string; my_name: string }

export const country = (iso3: string | null | undefined) =>
  AFRICAN_COUNTRIES.find((c) => c.iso3 === iso3)?.name ?? ''

export { AFRICAN_COUNTRIES }

export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET', cache: 'no-store',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.message || j.error || `Request failed (${res.status})`), { status: res.status })
  return j as T
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = (Date.now() - new Date(iso).getTime()) / 86400_000
  if (d < 1 / 24) return 'just now'
  if (d < 1) return `${Math.round(d * 24)} h ago`
  if (d < 2) return 'yesterday'
  if (d < 45) return `${Math.round(d)} days ago`
  return `${Math.round(d / 30)} months ago`
}

export function dueLabel(due: string): { text: string; late: boolean } {
  const today = new Date().toISOString().slice(0, 10)
  if (due < today) {
    const days = Math.round((Date.parse(today) - Date.parse(due)) / 86400_000)
    return { text: days === 1 ? 'yesterday' : `${days} days late`, late: true }
  }
  if (due === today) return { text: 'today', late: false }
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400_000)
  return { text: days === 1 ? 'tomorrow' : new Date(due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), late: false }
}

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : `$${Math.round(n).toLocaleString('en-US')}`

export const linkedinSearch = (company: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}`

/**
 * Remove an organisation from either pipeline, with everything under it
 * (people, drafts, LinkedIn, tasks, its website quote request). Owners only.
 * Asks first; true when it was deleted.
 */
export async function deleteOrg(id: string, name: string): Promise<boolean> {
  if (!confirm(`Remove ${name} for good?\n\nIts people, drafts, LinkedIn steps, tasks, notes and any website quote request go with it. This can't be undone.`)) return false
  try {
    await api(`/api/admin/sales/${id}`, { method: 'DELETE' })
    return true
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not delete it.')
    return false
  }
}
