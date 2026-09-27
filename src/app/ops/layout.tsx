import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ops · Lenga Maps', robots: { index: false, follow: false } }

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return children
}
