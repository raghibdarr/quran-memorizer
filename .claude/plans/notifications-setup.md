# Turning on web reminders and the weekly email (M8)

Everything is built and shipped; these switch it on. Until then Settings shows the
switches, but saving fails politely ("Couldn't save that") and the senders do nothing.

## 1. Database (once)
Apply `supabase/migrations/003_notifications.sql` in the Supabase SQL editor
(and `002_user_data_rev.sql` if it still isn't applied).

## 2. Push keys (once)
Run `npx web-push generate-vapid-keys` and keep the output private.

## 3. Netlify environment variables (Site settings → Environment variables)
| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the Public Key from step 2 (also needed at build time) |
| `VAPID_PRIVATE_KEY` | the Private Key from step 2 |
| `VAPID_SUBJECT` | `mailto:` plus an address you read, e.g. `mailto:you@example.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project settings → API → service_role (secret, server only) |
| `NEXT_PUBLIC_SUPABASE_URL` | already set for the app |
| `RESEND_API_KEY` | from resend.com (free tier is plenty) |
| `DIGEST_FROM` | e.g. `Takrar <hello@yourdomain>`; the domain must be verified in Resend |
| `DIGEST_SECRET` | any long random string (signs unsubscribe links) |

Then trigger a redeploy so the public key is baked into the build.

## What runs
- `netlify/functions/send-reminders.mts`, hourly: for each browser whose chosen local
  hour is now, one push if reviews are due today; dead subscriptions are removed.
- `netlify/functions/send-digest.mts`, Mondays 09:00 UTC: opted-in users away 8+ days
  with reviews due get one email, at most weekly, with one-click unsubscribe
  (`digest-unsubscribe.mts`).
- Both are no-ops (they say "not configured") while variables are missing.

## Limits worth knowing
- Web push needs the user signed in (the server reads their synced reviews).
- iPhone/iPad: push works only after Add to Home Screen (iOS 16.4+); Settings says so.
- The phone apps don't use any of this: they schedule local reminders on the device.
