// See src/app/login/layout.tsx for the noindex rationale.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Forgot password · Lenga Maps',
  description: 'Reset the password on your Lenga Maps account.',
  robots:      { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
