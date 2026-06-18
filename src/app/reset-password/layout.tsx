// See src/app/login/layout.tsx for the noindex rationale.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Reset password · Lenga Maps',
  description: 'Set a new password for your Lenga Maps account.',
  robots:      { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
