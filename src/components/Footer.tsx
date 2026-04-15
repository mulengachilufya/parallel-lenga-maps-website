'use client'

import Link from 'next/link'
import Image from 'next/image'

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
  </svg>
)

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
)

export default function Footer() {
  return (
    <footer className="bg-dark-deep border-t border-white/[0.07]">
      <div className="max-w-[1100px] mx-auto px-5 sm:px-6 lg:px-12 py-16">
        <div className="flex flex-wrap gap-16">
          {/* Brand */}
          <div className="flex-[1.5] min-w-[200px] flex flex-col gap-4">
            <Image
              src="/images/branding/logo.png"
              alt="Lenga Maps"
              width={48}
              height={48}
              className="object-contain"
            />
            <p className="text-[0.95rem] leading-[1.7] text-white/45">
              Unmasking Africa with<br />Data and Intelligence.
            </p>
          </div>

          {/* Contact */}
          <div className="flex-1 min-w-[160px] flex flex-col gap-3">
            <h4 className="text-[0.78rem] font-bold tracking-[0.14em] uppercase text-gold mb-1">
              Get in Touch
            </h4>
            <a
              href="mailto:lengamaps@gmail.com"
              className="text-[0.95rem] text-white/65 hover:text-white transition-colors"
            >
              lengamaps@gmail.com
            </a>
            <a
              href="tel:+260965699359"
              className="text-[0.95rem] text-white/65 hover:text-white transition-colors"
            >
              +260 965 699 359
            </a>
          </div>

          {/* Social */}
          <div className="flex-1 min-w-[160px] flex flex-col gap-3">
            <h4 className="text-[0.78rem] font-bold tracking-[0.14em] uppercase text-gold mb-1">
              Follow Us
            </h4>
            <a
              href="https://www.facebook.com/share/1GVA56sV9X/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-[0.95rem] text-white/65 hover:text-gold transition-colors"
            >
              <FacebookIcon />
              Facebook
            </a>
            <a
              href="https://www.linkedin.com/company/lenga-maps/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-[0.95rem] text-white/65 hover:text-gold transition-colors"
            >
              <LinkedinIcon />
              LinkedIn
            </a>
          </div>

          {/* Quick Links */}
          <div className="flex-1 min-w-[160px] flex flex-col gap-3">
            <h4 className="text-[0.78rem] font-bold tracking-[0.14em] uppercase text-gold mb-1">
              Platform
            </h4>
            {[
              { href: '/about-us', label: 'About Us' },
              { href: '/services', label: 'Services' },
              { href: '/pricing', label: 'Download GIS Data' },
              { href: '/contact-us', label: 'Contact Us' },
              { href: '/login', label: 'Login' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[0.95rem] text-white/65 hover:text-gold transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.07] px-5 sm:px-6 lg:px-12 py-5 text-center">
        <p className="text-[0.82rem] text-white/30 tracking-[0.03em]">
          &copy; {new Date().getFullYear()} Lenga Maps. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
