# Ledger project memory

Updated: 2026-11-04

## User intent
- Build an attractive, responsive React TSX Ledger report app, usable across devices.
- Add features incrementally as the user provides them.
- User will create a Firebase project; support Google account creation/sign-in and persistent per-user data.
- First feature: manage merchants served by the business, with name, ID, password and GST records. Store passwords securely.

## Implemented decisions
- React + TypeScript + Vite frontend; Firebase Google Authentication and Cloud Firestore integration ready for configuration.
- Treat merchant ID as GST portal login ID. GSTIN is separate and optional; verify this interpretation with the user if future requirements differ.
- Private per-user directory, not shared across users. No teams or roles yet.
- Merchant create/read/update/delete, text search, category filter; optional email, phone and notes.
- Merchant passwords must be retrievable, so encrypt rather than hash. Browser Web Crypto AES-GCM with PBKDF2-derived keys; explicit vault passphrase never persisted. No recovery feature.
- User supplied Firebase web configuration in ignored `.env` and reports completing Firebase setup. Never print or commit configuration values. Firebase is required; no demo records or local write fallback remain.
- Visual direction: quiet ivory/gray workspace, forest green actions, compact sidebar, responsive table, native modal forms.
- Overview shows directory metrics. Security view explains actual behavior. No filing status or GST reports invented.

## Next required external setup
- Firebase setup reported complete by user; local `.env` has all four required entries. Verify live Google sign-in and per-user persistence.
- Validate rules with emulator and Google sign-in/cloud persistence with the actual project before production.
- Ask for next feature and intended GST reporting workflow when provided. Do not assume filing cadence, tax calculations or team sharing.

## Working convention
Update this file after significant feature or architecture decisions. Do not record passwords, passphrases, tokens, private keys or personal merchant data here. This is repository memory, not a promise of cross-chat AI memory.

## Verification
- TypeScript and production build passed. Encryption tests passed. Dependency audit: zero reported vulnerabilities after patching transitive grpc dependency.
- Browser checked merchant creation and rendered phone/desktop layouts. Live Firebase flows and rules emulator tests remain pending configuration.

## Hosting and local testing update
- User plans GitHub → Cloudflare hosting later, after app completion. Do not deploy now.
- Leave the local development server running when requested for user testing.
- Initial configured browser check: 127.0.0.1 is not authorized for Google OAuth. Prefer localhost or add the exact host in Firebase authorized domains.
- Added sign-in pending state and readable sign-in errors; corrected signed-out profile label.

## Configured local verification (2026-11-04)
- Production build and encryption tests pass with Firebase config present.
- Read-only REST check of configured Firestore: unauthenticated merchant collection read rejected with HTTP 403. This does not verify cross-user access or write validation.
- Browser: configured signed-out view and security navigation verified. Google attempt from 127.0.0.1 rejected as unauthorized-domain; localhost attempt did not complete the popup in embedded browser. No authenticated cloud CRUD or reload-persistence verification claimed.
- Local development server left running for user testing at http://localhost:5173/.

## Source control
- User requested Git initialization and an initial commit. User will add the GitHub origin and push, then connect Cloudflare.
- Keep `.env`, dependencies, builds and local preview screenshots untracked. Commit the empty `.env.example` and dependency lockfile.

## Firebase-only data (2026-11-04)
- User requested removal of all demo data and direct Firebase use. Removed sample merchant fixtures, demo UI and in-memory create/delete fallback.
- Directory starts empty; Firestore subscriptions are the only source of merchant records. Missing configuration shows setup guidance and disables sign-in/create.
- Removed generated preview screenshots from the workspace. Earlier references to demo testing above are historical. No Firebase records were deleted.
