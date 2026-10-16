'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useSyncStatus } from '@/components/sync-provider'
import AuthModal from './auth-modal'
import BottomSheet from '@/components/ui/bottom-sheet'
import ConfirmSheet from '@/components/ui/confirm-sheet'
import AppLink from '@/components/app-link'

function AccountMenu({ open, email, onSignOut, onDelete, onClose }: {
  open: boolean
  email: string
  onSignOut: () => void
  onDelete: () => Promise<boolean>
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  const remove = async () => {
    setConfirming(false)
    setDeleting(true)
    setFailed(false)
    const ok = await onDelete()
    setDeleting(false)
    if (ok) onClose()
    else setFailed(true)
  }

  return (
    <>
      <BottomSheet open={open && !confirming} onClose={onClose} title="Account" doneButton>
        <p className="-mt-2 text-sm text-muted">{email}</p>
        <button
          onClick={onSignOut}
          className="mt-6 min-h-12 w-full rounded-xl border-2 border-red-400/30 px-4 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
        >
          Sign out
        </button>
        <button
          onClick={() => setConfirming(true)}
          disabled={deleting}
          className="mt-2 min-h-12 w-full rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:text-red-500 disabled:opacity-60"
          data-delete-account
        >
          {deleting ? 'Deleting your account…' : 'Delete account'}
        </button>
        {failed && (
          <p className="mt-1 text-center text-xs text-red-500" role="alert">
            Couldn&apos;t delete your account just now. Check your connection and try again.
          </p>
        )}
        <p className="mt-4 text-center text-xs text-muted">
          <AppLink href="/privacy" className="underline underline-offset-2" onClick={onClose}>Privacy policy</AppLink>
        </p>
      </BottomSheet>
      <ConfirmSheet
        open={open && confirming}
        title="Delete your account?"
        message="This deletes your account and the progress synced to it, for good. Progress saved on this device stays here; Settings can erase it too."
        confirmLabel="Delete my account"
        destructive
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </>
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
          onDelete={auth.deleteAccount}
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
