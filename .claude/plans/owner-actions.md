# Waiting on the owner (as of 2026-10-17)

Everything that doesn't need you is built. These need your accounts, your phone or your decision.

## Switch things on (Supabase / Netlify / GitHub)
1. ~~Apply migrations~~ **Done 2026-10-16** (002–005 applied in the SQL editor, checked: rev column, circles, notifications, delete_my_account).
2. **Web push + weekly email** (M8): VAPID keys, Netlify env vars, Resend with a verified domain,
   redeploy. Steps: `notifications-setup.md`.
3. ~~Sign-in links in the apps~~ **Done 2026-10-16** (`takrar://auth/callback` added to Supabase redirect URLs; repo variable `NATIVE_AUTH=on`).
4. **Contact address** for the privacy page: Netlify env `NEXT_PUBLIC_CONTACT_EMAIL` and the repo
   variable `CONTACT_EMAIL`.

## Decisions
5. ~~Quran.com content we bundle~~ **Done 2026-10-17** (open sources; `data-sources/README.md`,
   Settings → Sources, `/licenses.txt`). Arabic text: Tanzil. Translations: Saheeh via QuranEnc and
   The Clear Quran (choice in Settings). Tajweed: cpfair (CC BY 4.0). IndoPak: DigitalKhatt.
   Transliteration: our own. Word audio: cut from the recitation. Reciters: nothing from Tarteel's
   or Quran.com's CDNs; word timings from quran-align and QUD (both CC BY 4.0).
   **Still yours:**
   - **Send the word-by-word email** (`email-word-by-word-permission.md`). The word meanings are the
     only Quran.com-sourced data left; if the Corpus team says no, we write our own.
   - **Ask EveryAyah** (`email-everyayah-permission.md`): most recitations stream from it and it
     publishes no terms.
   - **Ghamdi, Husary (Mujawwad), Tunaiji** play without word highlighting now: their only open
     timings fit Tarteel's copies. Highlighting can come back by measuring each surah's offset against
     Tarteel's files once at build time (analysis only, nothing redistributed). Your call whether
     that's acceptable; report: `Downloads/reports/Takrar reciter hosts.md`.
   - **Maher Al-Muaiqly, Yasser Ad-Dussary** lost highlighting (their timings were QUL's own, no
     licence shown). Ask Tarteel/QUL for permission, or leave them unhighlighted.
6. ~~KFGQPC fonts~~ **Done 2026-10-17**: Amiri Quran (OFL) for Uthmani, DigitalKhatt IndoPak (OFL)
   for IndoPak. It also fixed dotted circles KFGQPC drew for Tanzil's silent-letter sign.
7. **More translations / tafsir** (roadmap #05, #07): which ones, then permission from each publisher.
8. **Sign in with Apple** or hide Google on iOS (currently hidden: Apple 4.8).
9. **Teacher / parent links** (roadmap #19): a policy for children's data first.
10. **Warsh / Qaloon** (roadmap #21): text and layout licences, per-recording rights.
11. ~~Learning plans and guides~~ **Done 2026-10-17**: /plans (seven ready-made plans that open the
    planner filled in) and /blog (six original guides). Read them over: they speak for Takrar, and
    you may want to change the wording or add your own.

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
19. The new visual pieces (2026-10-17): the similar-verse morph, mushaf "Ink", the gilded edge on
    Progress (and its Share), tajweed "Hear it" demos, and the voice check's pace line with a real mic.
