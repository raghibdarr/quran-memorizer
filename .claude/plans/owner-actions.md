# Waiting on the owner (as of 2026-10-16)

Everything that doesn't need you is built. These need your accounts, your phone or your decision.

## Switch things on (Supabase / Netlify / GitHub)
1. ~~Apply migrations~~ **Done 2026-10-16** (002–005 applied in the SQL editor, checked: rev column, circles, notifications, delete_my_account).
2. **Web push + weekly email** (M8): VAPID keys, Netlify env vars, Resend with a verified domain,
   redeploy. Steps: `notifications-setup.md`.
3. ~~Sign-in links in the apps~~ **Done 2026-10-16** (`takrar://auth/callback` added to Supabase redirect URLs; repo variable `NATIVE_AUTH=on`).
4. **Contact address** for the privacy page: Netlify env `NEXT_PUBLIC_CONTACT_EMAIL` and the repo
   variable `CONTACT_EMAIL`.

## Decisions
5. **Quran.com content we bundle.** `scripts/fetch-quran-data.ts` pulls words, translations and
   transliterations from api.quran.com at build time and ships them; Quran Foundation's developer
   terms forbid build-time bundling (research memo: `Downloads/reports/Quran.com suite and Takrar.md`).
   Options: (a) move to openly licensed sources (Tanzil text, QUL resources after checking each
   licence), or (b) Quran Foundation's Content Sync API behind a server proxy, re-synced weekly.
   The Sahih International translation also needs its publisher's consent either way.
6. **KFGQPC fonts.** `public/fonts/kfgqpc-hafs.woff` (the app's Arabic font) needs the Complex's
   written approval, or swap it for an OFL font (the DigitalKhatt fonts the mushaf view uses are OFL).
7. **More translations / tafsir** (roadmap #05, #07): which ones, then permission from each publisher.
8. **Sign in with Apple** or hide Google on iOS (currently hidden: Apple 4.8).
9. **Teacher / parent links** (roadmap #19): a policy for children's data first.
10. **Warsh / Qaloon** (roadmap #21): text and layout licences, per-recording rights.
11. **Learning plans and guides** (from the Quran.com research): the recommendation is our own
    hifz plans on the review engine plus a few short original memorisation guides; the content
    would be in your voice.

## Accounts
12. Apple Developer ($99/yr), Google Play Console ($25), signing keys, the permanent bundle id.
13. **iOS widget** needs an App Group set up on the Apple account. **CarPlay** needs Apple's
    audio entitlement. **Android Auto** needs Play's review (and a test in the Desktop Head Unit).

## On your phone (latest APK from the `mobile/device-test` build)
14. Feel, audio, mic prompt, safe areas, daily reminder delivery (M11a).
15. Voice check (Tilawa 0.4), recite-to-find, voice reveal in the mushaf's recite mode.
16. Recitation player: screen off, lock-screen controls, sleep timer, play-to-juz across surahs,
    downloads playing offline.
17. Home-screen widget; Android Auto in the Desktop Head Unit.
18. Motion dials (M11 checkpoint B), then I roll the accents out app-wide.
