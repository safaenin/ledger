# Ledger

Responsive React + TypeScript merchant workspace. Vite, Firebase Authentication, Cloud Firestore, and browser Web Crypto.

## Run

```
npm install
cp .env.example .env
npm run dev
```

Firebase configuration is required. The app starts with an empty directory and reads and writes merchant records only through your signed-in Firebase account. If configuration is missing, a setup message is shown and sign-in and merchant creation are disabled. No sample merchants or local-only storage fallback are included.

## Connect your Firebase project

1. Create a Firebase project and register a Web app.
2. Copy its apiKey, authDomain, projectId and appId into the matching VITE_FIREBASE_* entries in `.env`. These are public client configuration; never put service account keys here.
3. Enable Authentication → Sign-in method → Google and choose a support email.
4. Add your development and deployment domains to Authentication → Settings → Authorized domains (including localhost when needed).
5. Create a Cloud Firestore database. Publish `firestore.rules` in its Rules tab **before using real data**. Alternatively, with Firebase CLI installed, run `firebase use --add` and `firebase deploy --only firestore:rules`.
6. Restart the dev server. Sign in with Google. Merchants are saved under `users/{uid}/merchants/{id}` and synchronized live.
7. Hosting is planned through GitHub → Cloudflare after the app is complete. No deployment is needed for local testing. Production must use HTTPS for Web Crypto.

For local testing open `http://localhost:5173/`. Authorize `localhost` in Firebase Authentication. If you instead open `http://127.0.0.1:5173/`, authorize `127.0.0.1` separately.

## Security model

Google handles account authentication. Each merchant portal password is encrypted on the client using AES-256-GCM, a random 96-bit IV and 128-bit salt, and PBKDF2-SHA-256 (600,000 iterations). Only ciphertext, IV, salt and version are stored. Passphrases and decryption keys are not persisted; use a password manager to remember a strong, unique vault passphrase. Forgotten passphrases cannot be recovered. A different passphrase can be used per record; the exact original is required to reveal it. Replacing a credential requires entering a new portal password and passphrase.

Merchant names, GSTINs, portal IDs, contacts and notes are ordinary Firestore fields protected by account-specific rules, not vault-encrypted. Revealed passwords are cleared after 20 seconds, on dialog close and account changes. Browser compromise or malicious scripts can still access data while in use; avoid untrusted scripts and shared browser sessions. No analytics are included. Google Fonts is loaded for typography, with local fallbacks.

## Validation

`npm run build` checks TypeScript and creates the production build. `npm test` checks encryption round-trip, wrong-passphrase rejection, tamper detection and randomized encryption. Firestore rules should additionally be tested against your Firebase emulator before production. Firebase is configured locally; authenticated cloud operations still require verification with Google sign-in.

## Merchant billing and payments

Open a merchant from the directory to view their billing overview: total bills generated, total billed, total paid and outstanding balance. Raise bills for weekly, monthly, quarterly, yearly, one-time or custom service periods. These are manual bills, not scheduled generation. Currency is INR; enter the final charge including any taxes you have calculated elsewhere.

Open a bill to record full or partial payments with date, method and optional reference. Statuses are Unpaid, Part paid and Paid; outstanding bills past their due date also show Overdue. Dates use India time for today's date. Totals cover all bills for the selected merchant, independent of search/status filters. Recording a payment does not charge a customer or initiate a transfer.

**Publish the updated `firestore.rules` in your Firebase project's Firestore Rules tab before using billing.** Existing merchant records need no migration. Bills live at `users/{uid}/merchants/{merchantId}/bills/{billId}`; immutable receipts are in each bill's `payments` subcollection. Payment receipts and paid totals update atomically. Amounts use integer paise; overpayments are rejected. Repeated submissions with the same identifier do not double-count. Open a bill to edit its details or delete it if it has no payments. Once a payment is recorded, the issue date is locked and the bill amount must cover the recorded payments. Receipts are kept as payment history. Once billing starts, merchants cannot be deleted.

`npm test` runs billing math/date/validation tests and credential tests. `npm run test:rules` runs isolated Firestore emulator integration tests for creation, partial/full payments, reload, concurrent/duplicate submissions, overpayment rejection, merchant isolation and account access rules. Requires Java 21+ and Firebase CLI (`npm install -g firebase-tools`). The test project is `demo-ledger-billing`, never your live Firebase project; `firebase.test.json` keeps its emulator configuration separate.

Scope: merchant directory, GST identifying information, service billing and payment tracking. GST returns, filing deadlines, tax calculations, reports, teams and shared access are future features.

See `PROJECT_MEMORY.md` for ongoing product decisions.
