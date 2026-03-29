'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import Button from '@/components/ui/button'

type AuthView =
  | 'sign-in'
  | 'sign-up'
  | 'magic-link'
  | 'magic-link-sent'
  | 'confirm-email'
  | 'forgot-password'
  | 'reset-sent'
  | 'new-password'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  initialView?: AuthView
  isPasswordRecovery?: boolean
  error: string | null
  loading: boolean
  onSignIn: (email: string, password: string) => Promise<boolean>
  onSignUp: (email: string, password: string) => Promise<boolean>
  onSignInWithGoogle: () => Promise<boolean>
  onSignInWithMagicLink: (email: string) => Promise<boolean>
  onResetPassword: (email: string) => Promise<boolean>
  onUpdatePassword: (password: string) => Promise<boolean>
  onClearError: () => void
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function AuthModal({
  open,
  onClose,
  initialView = 'sign-in',
  isPasswordRecovery,
  error,
  loading,
  onSignIn,
  onSignUp,
  onSignInWithGoogle,
  onSignInWithMagicLink,
  onResetPassword,
  onUpdatePassword,
  onClearError,
}: AuthModalProps) {
  const [view, setView] = useState<AuthView>(initialView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isPasswordRecovery) setView('new-password')
  }, [isPasswordRecovery])

  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      onClearError()
      if (!isPasswordRecovery) setView(initialView)
    }
  }, [open, initialView, isPasswordRecovery, onClearError])

  const switchView = (v: AuthView) => {
    onClearError()
    setView(v)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let success = false

    switch (view) {
      case 'sign-in':
        success = await onSignIn(email, password)
        if (success) onClose()
        break
      case 'sign-up':
        success = await onSignUp(email, password)
        if (success) setView('confirm-email')
        break
      case 'magic-link':
        success = await onSignInWithMagicLink(email)
        if (success) setView('magic-link-sent')
        break
      case 'forgot-password':
        success = await onResetPassword(email)
        if (success) setView('reset-sent')
        break
      case 'new-password':
        success = await onUpdatePassword(password)
        if (success) onClose()
        break
    }
  }

  if (!open) return null

  const content = (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        {/* Close button */}
        <div className="flex justify-end">
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Confirmation screens */}
        {view === 'confirm-email' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 4L12 13 2 4" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground">Check your email</h2>
            <p className="text-sm text-muted">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Click the link to activate your account.
            </p>
            <Button variant="ghost" onClick={() => switchView('sign-in')} className="w-full">
              Back to sign in
            </Button>
          </div>
        )}

        {view === 'magic-link-sent' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 4L12 13 2 4" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground">Magic link sent</h2>
            <p className="text-sm text-muted">
              Check <span className="font-medium text-foreground">{email}</span> for a sign-in link.
            </p>
            <Button variant="ghost" onClick={() => switchView('sign-in')} className="w-full">
              Back to sign in
            </Button>
          </div>
        )}

        {view === 'reset-sent' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 4L12 13 2 4" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground">Reset link sent</h2>
            <p className="text-sm text-muted">
              Check <span className="font-medium text-foreground">{email}</span> for a password reset link.
            </p>
            <Button variant="ghost" onClick={() => switchView('sign-in')} className="w-full">
              Back to sign in
            </Button>
          </div>
        )}

        {/* Form views */}
        {(view === 'sign-in' || view === 'sign-up' || view === 'magic-link' || view === 'forgot-password' || view === 'new-password') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">
              {view === 'sign-in' && 'Sign in'}
              {view === 'sign-up' && 'Create account'}
              {view === 'magic-link' && 'Sign in with magic link'}
              {view === 'forgot-password' && 'Reset password'}
              {view === 'new-password' && 'Set new password'}
            </h2>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Google OAuth — sign-in and sign-up only */}
            {(view === 'sign-in' || view === 'sign-up') && (
              <>
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-foreground/15 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-foreground/10" />
                  <span className="text-xs text-muted">or</span>
                  <div className="h-px flex-1 bg-foreground/10" />
                </div>
              </>
            )}

            {/* Email field — all views except new-password */}
            {view !== 'new-password' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-foreground/15 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
                  placeholder="you@example.com"
                />
              </div>
            )}

            {/* Password field — sign-in, sign-up, new-password */}
            {(view === 'sign-in' || view === 'sign-up' || view === 'new-password') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  {view === 'new-password' ? 'New password' : 'Password'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={view === 'sign-up' || view === 'new-password' ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl border border-foreground/15 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
                  placeholder={view === 'sign-up' ? 'At least 6 characters' : ''}
                />
              </div>
            )}

            {/* Forgot password link */}
            {view === 'sign-in' && (
              <button
                type="button"
                onClick={() => switchView('forgot-password')}
                className="text-xs text-teal hover:underline"
              >
                Forgot password?
              </button>
            )}

            <Button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2">
              {loading && <Spinner />}
              {view === 'sign-in' && 'Sign in'}
              {view === 'sign-up' && 'Create account'}
              {view === 'magic-link' && 'Send magic link'}
              {view === 'forgot-password' && 'Send reset link'}
              {view === 'new-password' && 'Update password'}
            </Button>

            {/* View switching links */}
            <div className="space-y-2 text-center text-xs text-muted">
              {view === 'sign-in' && (
                <>
                  <p>
                    Don&apos;t have an account?{' '}
                    <button type="button" onClick={() => switchView('sign-up')} className="text-teal hover:underline">
                      Sign up
                    </button>
                  </p>
                  <p>
                    <button type="button" onClick={() => switchView('magic-link')} className="text-teal hover:underline">
                      Sign in with magic link
                    </button>
                  </p>
                </>
              )}
              {view === 'sign-up' && (
                <p>
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchView('sign-in')} className="text-teal hover:underline">
                    Sign in
                  </button>
                </p>
              )}
              {(view === 'magic-link' || view === 'forgot-password') && (
                <p>
                  <button type="button" onClick={() => switchView('sign-in')} className="text-teal hover:underline">
                    Back to sign in
                  </button>
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
