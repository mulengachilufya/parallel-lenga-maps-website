'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Only allow safe internal paths for `next` (must start with "/" and not "//")
  const nextParam = searchParams.get('next')
  const nextPath = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/dashboard'
  const hasNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      router.push(nextPath)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Back to home */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-10">
            <svg viewBox="0 0 40 40" className="w-9 h-9">
              <circle cx="20" cy="20" r="18" fill="#1E5F8E" />
              <ellipse cx="20" cy="20" rx="8" ry="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
              <line x1="2" y1="20" x2="38" y2="20" stroke="#F5B800" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
            </svg>
            <span className="font-bold text-navy text-lg">LENGA <span className="text-accent">MAPS</span></span>
          </Link>

          <h1 className="text-3xl font-black text-navy mb-2">Welcome back</h1>
          <p className="text-gray-500 mb-8">
            {hasNext ? 'Sign in to continue where you left off.' : 'Sign in to access your datasets and downloads.'}
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm"
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-navy mb-2">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-navy">Password</label>
                <Link href="/forgot-password" className="text-xs text-primary hover:text-primary-dark">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-8">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary font-semibold hover:text-primary-dark">
              Create one free
            </Link>
          </p>

          <div className="mt-8 pt-8 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Need help?{' '}
              <a href="mailto:lengamaps@gmail.com" className="text-primary hover:underline">
                lengamaps@gmail.com
              </a>
            </p>
          </div>
        </motion.div>
      </div>

      {/* Right: Image */}
      <div className="hidden lg:block flex-1 relative">
        <Image
          src="https://images.unsplash.com/photo-1504198453344-8b75b3bd3a18?w=800&q=80"
          alt="African river system"
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 gradient-primary opacity-80" />
        <div className="absolute inset-0 flex flex-col justify-end p-16">
          <blockquote className="text-white text-2xl font-bold leading-snug mb-4">
            &ldquo;Unmasking Africa with<br />Data and Intelligence.&rdquo;
          </blockquote>
          <p className="text-blue-200 text-sm">Access 15+ professional GIS datasets covering all of Africa.</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <LoginForm />
    </Suspense>
  )
}
