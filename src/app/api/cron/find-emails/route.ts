/**
 * Daily: check a batch of prospects in each pipeline for a published company
 * inbox (src/lib/sales/find-emails.ts), so new and imported prospects get an
 * email address without anyone pressing a button. Requires CRON_SECRET like
 * the other jobs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { scanBatch } from '@/lib/sales/find-emails'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const sales = await scanBatch('sales', { limit: 12, budgetMs: 25_000 })
  const partner = await scanBatch('partner', { limit: 12, budgetMs: 25_000 })
  return NextResponse.json({ sales, partner })
}
