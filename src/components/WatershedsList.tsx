'use client'

interface WatershedsListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  hasAccess?: boolean
}

// Placeholder while HydroBASINS files are processed. No DownloadGate hook
// needed yet — once data lands, replace this with a real list component
// matching the AquiferList / ProtectedAreasList pattern (Pro-tier gate).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function WatershedsList({ userPlan, hasAccess }: WatershedsListProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-gray-500 text-sm text-center">
      HydroBASINS watershed data coming soon — files are being processed.
    </div>
  )
}
