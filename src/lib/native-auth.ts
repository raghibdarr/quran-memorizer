'use client';

// Sign-in flows that leave the app and come back (M11e): Google OAuth opens in the
// system browser (Google blocks sign-in inside embedded WebViews), and magic-link,
// password-reset and sign-up emails link back in. Both return through the custom
// scheme takrar://auth/callback?code=…, which the app exchanges for a session (PKCE).
//
// Needs, once: takrar://auth/callback in Supabase → Authentication → URL
// Configuration → Redirect URLs, then NEXT_PUBLIC_NATIVE_AUTH=on in the app build.
// Until then the app offers email + password only, which works everywhere.

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { createClient } from '@/lib/supabase/client';
import { isNative, nativePlatform } from './native';

export const NATIVE_AUTH_CALLBACK = 'takrar://auth/callback';
/** Fired after a password-reset link signs the user in, so the app asks for a new password */
export const PASSWORD_RECOVERY_EVENT = 'takrar:password-recovery';

/** Whether flows that bounce through a browser or an email link can return to this app */
export function linkFlowsAvailable(): boolean {
  return !isNative() || process.env.NEXT_PUBLIC_NATIVE_AUTH === 'on';
}

/**
 * Apple 4.8: an iOS app offering Google sign-in must also offer Sign in with Apple.
 * Until that's set up, iOS keeps email sign-in only.
 */
export function googleAvailable(): boolean {
  if (!linkFlowsAvailable()) return false;
  return nativePlatform() !== 'ios' || process.env.NEXT_PUBLIC_IOS_GOOGLE === 'on';
}

/** Where an auth email or OAuth provider should send the user back to */
export function authRedirect(kind?: 'recovery'): string {
  if (isNative()) return kind ? `${NATIVE_AUTH_CALLBACK}?type=${kind}` : NATIVE_AUTH_CALLBACK;
  return `${window.location.origin}/auth/callback`;
}

/** Open the provider's sign-in page in the system browser (in-app browser tab) */
export async function openAuthPage(url: string): Promise<void> {
  await Browser.open({ url, presentationStyle: 'popover' });
}

/** Parses takrar://auth/callback?code=…&type=… (null for any other URL) */
export function parseAuthCallback(url: string): { code: string | null; recovery: boolean; error: string | null } | null {
  if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return null;
  const query = url.slice(NATIVE_AUTH_CALLBACK.length).replace(/^[/]?[?#]?/, '');
  // Errors can arrive in the fragment (OAuth) or the query (email links)
  const params = new URLSearchParams(query.replace('#', '&'));
  return {
    code: params.get('code'),
    recovery: params.get('type') === 'recovery',
    error: params.get('error_description') ?? params.get('error'),
  };
}

async function handle(url: string | undefined | null) {
  const parsed = url ? parseAuthCallback(url) : null;
  if (!parsed) return;
  Browser.close().catch(() => {});
  if (!parsed.code) return;
  const { error } = await createClient().auth.exchangeCodeForSession(parsed.code);
  if (!error && parsed.recovery) window.dispatchEvent(new Event(PASSWORD_RECOVERY_EVENT));
}

/** Listen for auth deep links (also the one that cold-started the app). Returns a cleanup. */
export function initNativeAuth(): () => void {
  if (!isNative()) return () => {};
  const listener = App.addListener('appUrlOpen', ({ url }) => { void handle(url); });
  App.getLaunchUrl().then((launch) => handle(launch?.url)).catch(() => {});
  return () => { listener.then((l) => l.remove()); };
}
