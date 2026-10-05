'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useSyncStatus } from '@/components/sync-provider'
import AuthModal from './auth-modal'
import BottomSheet from '@/components/ui/bottom-sheet'

function AccountMenu({ open, email, onSignOut, onClose }: { open: boolean; email: string; onSignOut: () => void; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Account" doneButton>
      <p className="-mt-2 text-sm text-muted">{email}</p>
      <button
        onClick={onSignOut}
        className="mt-6 min-h-12 w-full rounded-xl border-2 border-red-400/30 px-4 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
      >
        Sign out
      </button>
    </BottomSheet>
  )
}

export default function UserButton() {
  const auth = useAuth()
  const { status: syncStatus } = useSyncStatus()
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      {auth.user ? (
        <button
          onClick={() => setShowModal(true)}
          className="hit-44 relative flex h-8 w-8 items-center justify-center rounded-full bg-teal text-xs font-bold text-on-teal"
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
          className="hit-44 whitespace-nowrap rounded-lg bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal transition-colors hover:bg-teal/20"
        >
          Sign in
        </button>
      )}

      {auth.user ? (
        <AccountMenu
          open={showModal}
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
