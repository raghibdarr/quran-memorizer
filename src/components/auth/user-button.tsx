'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/hooks/use-auth'
import { useSync } from '@/hooks/use-sync'
import AuthModal from './auth-modal'

function AccountMenu({ email, onSignOut, onClose }: { email: string; onSignOut: () => void; onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null)
  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-foreground">Account</h2>
            <p className="mt-1 text-sm text-muted">{email}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <button
          onClick={onSignOut}
          className="mt-6 w-full rounded-xl border-2 border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
        >
          Sign out
        </button>
      </div>
    </div>,
    document.body
  )
}

export default function UserButton() {
  const auth = useAuth()
  const { status: syncStatus } = useSync(auth.user)
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      {auth.user ? (
        <button
          onClick={() => setShowModal(true)}
          className="relative flex h-8 w-8 items-center justify-center rounded-full bg-teal text-xs font-bold text-white"
          title={auth.user.email ?? 'Account'}
        >
          {(auth.user.email?.[0] ?? '?').toUpperCase()}
          {syncStatus === 'syncing' && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-cream bg-gold animate-pulse" />
          )}
          {syncStatus === 'error' && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-cream bg-red-500" />
          )}
        </button>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal transition-colors hover:bg-teal/20"
        >
          Sign in
        </button>
      )}

      {showModal && auth.user ? (
        <AccountMenu
          email={auth.user.email ?? ''}
          onSignOut={async () => { await auth.signOut(); setShowModal(false) }}
          onClose={() => setShowModal(false)}
        />
      ) : (
        <AuthModal
          open={showModal}
          onClose={() => setShowModal(false)}
          isPasswordRecovery={auth.isPasswordRecovery}
          error={auth.error}
          loading={auth.loading}
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
          onSignInWithGoogle={auth.signInWithGoogle}
          onSignInWithMagicLink={auth.signInWithMagicLink}
          onResetPassword={auth.resetPassword}
          onUpdatePassword={auth.updatePassword}
          onClearError={auth.clearError}
        />
      )}
    </>
  )
}
