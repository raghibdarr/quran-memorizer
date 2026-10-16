'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import AuthModal from './auth-modal';
import { cn } from '@/lib/cn';

const DISMISSED = 'sync-pitch-dismissed';

/**
 * Sign-up prompt at a moment you've earned something (M8, audit M22): a finished
 * lesson, a finished day, a backup just saved. Shown only when signed out, and gone
 * for good once you say "Not now". Before this, the only way in was the small Sign in
 * button in a header.
 */
export default function SyncPitch({ moment, className }: { moment: 'lesson' | 'day' | 'backup'; className?: string }) {
  const auth = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; }
  });
  const [open, setOpen] = useState(false);

  if (dismissed || auth.loading || auth.user) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* private mode: just hide for now */ }
    setDismissed(true);
  };

  const line =
    moment === 'backup' ? 'A backup file is one copy. An account keeps your progress synced and safe without thinking about it.'
    : moment === 'day' ? 'Your streak and every lesson live on this device only. A free account keeps them safe and on all your devices.'
    : 'Your progress lives on this device only. A free account keeps it safe and syncs it to your other devices.';

  return (
    <div className={cn('rounded-2xl border border-teal/20 bg-teal/5 p-4 text-left', className)}>
      <p className="text-sm font-semibold text-foreground">Keep your progress safe</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{line}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tactile-btn min-h-11 flex-1 rounded-xl bg-teal px-4 text-sm font-semibold text-on-teal"
        >
          Create free account
        </button>
        <button type="button" onClick={dismiss} className="min-h-11 rounded-xl px-4 text-sm font-medium text-muted hover:text-foreground">
          Not now
        </button>
      </div>
      {open && (
        <AuthModal
          open={open}
          onClose={() => setOpen(false)}
          initialView="sign-up"
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
    </div>
  );
}
