'use client'

interface WatershedsListProps {
  userPlan?: 'basic' | 'pro'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function WatershedsList({ userPlan }: WatershedsListProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-gray-500 text-sm text-center">
      HydroBASINS watershed data coming soon — files are being processed.
    </div>
  )
}
