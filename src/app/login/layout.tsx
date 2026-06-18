// Server-component layout so we can attach metadata to /login (the page
// itself is a client component and can't export metadata directly).
//
// Why noindex: auth pages were getting indexed and surfaced as Google
// sitelinks under lengamaps.com ("Welcome back · Back to home..." was
// appearing as a top result for a "lenga maps" search, looking like an
// auto-login entry point). De-listing /login from search results is the
// fix; clicking the sitelink still works for anyone who knows the URL,
// it just doesn't get advertised.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Sign in · Lenga Maps',
  description: 'Sign in to your Lenga Maps account.',
  robots:      { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
