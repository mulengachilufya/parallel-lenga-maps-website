// See src/app/login/layout.tsx for the noindex rationale.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Create your account · Lenga Maps',
  description: 'Sign up for a Lenga Maps account and start your free trial.',
  robots:      { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
