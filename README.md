# Hànzì Path · learn Chinese with friends

A small installable web app (PWA) for HSK 1 and HSK 2 Chinese: spaced-repetition words, tones, stroke-order writing,
sentence building, daily quests, XP ranks, badges, a friend-group leaderboard and push reminders.

**Open it:** https://vbreskvar.github.io/hanzi-path/

- `index.html` styles + page skeleton, `app.js` all app logic, `data.js` HSK 1 + HSK 2 lesson data, `strokes.js` stroke-order data (Make Me a Hanzi / Hanzi Writer).
- `cloud.js` Firebase: Google sign-in, progress sync (merged, never overwritten), leaderboard, push tokens.
- `sw.js` offline cache + push notifications. Bump `VERSION` in it after changing app files.
- `firestore.rules` security rules (paste into the Firebase console).
- `.github/workflows/reminders.yml` hourly job that sends ~3 nudges a day per subscribed user (needs the `FIREBASE_SERVICE_ACCOUNT` repo secret).

Pronunciation uses the device's own text-to-speech voice. No publisher audio or workbook material is included.
