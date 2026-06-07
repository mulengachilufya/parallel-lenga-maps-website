'use client'

/**
 * Shared chrome for /admin/*.
 *
 * The public Navbar hides itself on /admin (it has the wrong palette and
 * exposes the marketing nav to admins, which is noise). Without this layout
 * the admin pages had no header at all — admins had to type URLs to switch
 * between /admin/payments and /admin/users, and there was no "exit" link
 * back to the main app.
 *
 * Layout-level auth: middleware already redirects anonymous users to
 * /login. Admin-email enforcement still happens in each /api/admin/*
 * route, so a non-admin who somehow lands here sees the chrome but the
 * data calls fail. Pages render their own "Not authorised" state when
 * that happens.
 */
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ArrowLeft, CreditCard, Users, LayoutGrid } from 'lucide-react'

const NAV = [
  { href: '/admin',          label: 'Overview', icon: LayoutGrid },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/users',    label: 'Users',    icon: Users },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-[#0D2B45] border-b border-blue-900/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Image
              src="/images/branding/logo.png"
              alt="Lenga Maps"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-white text-sm font-bold tracking-wide">
              ADMIN
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1 ml-2">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href ||
                (href !== '/admin' && pathname?.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-blue-900/60 text-white'
                      : 'text-blue-200 hover:bg-blue-900/40 hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-blue-200 hover:text-white text-xs font-medium transition-colors"
            >
              <ArrowLeft size={13} />
              Back to app
            </Link>
          </div>
        </div>

        {/* Tabs on mobile — same routes, just stacked under the bar */}
        <nav className="sm:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href ||
              (href !== '/admin' && pathname?.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-blue-900/60 text-white'
                    : 'text-blue-200 hover:bg-blue-900/40 hover:text-white'
                }`}
              >
                <Icon size={12} />
                {label}
              </Link>
            )
          })}
        </nav>
      </header>

      {children}
    </div>
  )
}
