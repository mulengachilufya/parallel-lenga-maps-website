import type { Metadata } from 'next'
import 'maplibre-gl/dist/maplibre-gl.css'
import './workspace.css'

export const metadata: Metadata = {
  title: 'Workspace · Lenga Maps',
  description: 'Shared GIS projects for Lenga Maps teams: live map layers, discussion and revision history.',
  robots: { index: false },
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children
}
