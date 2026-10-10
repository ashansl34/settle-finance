# Settle

A mobile-first finance MVP built with Next.js App Router, TypeScript, Tailwind CSS and Firebase. Includes a complete local demo, a phone-authenticated Firebase mode, shared expenses, verified loans and private personal finances. Currency is LKR throughout this MVP.

## Run locally

Requires Node.js 22.13+ and npm. The included lockfile pins the tested dependencies.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. With no Firebase configuration, the app opens in **Demo** mode. No account, phone number, cloud project or paid service is needed. Demo records stay in this browser's local storage. The **Demo person** selector switches between Ashan, Kasun, Nethmi and Dilshan. Reset through **Profile / Trust → Reset demo data**.

Demo identity switching and readable demo code hashes are deliberately confined to local mock mode. They are not authentication or production security. Never use demo mode for real financial records.

## Try the main flows

1. **Dashboard / My Balance:** add income, expense or an account transfer; filter a month/day; inspect categories, accounts and reports. Transfers move money between accounts without changing overall cash, income or spending. Reports export the selected month as CSV.
2. **Friends:** accept Dilshan's request as Ashan; search by name/handle; connect and request money. Phone numbers never appear in the member directory.
3. **Loan activation:** as Kasun, open **My Loans → Bus pass for next month**, accept, then select **I've sent the money**. Switch to Ashan, open the same loan, confirm actual receipt and generate a code. Copy it, switch to Kasun and enter it. The loan becomes active only after this handshake.
4. **Partial repayment:** as Ashan, open the textbooks loan and start a repayment. Switch to Kasun to confirm actual receipt and generate a code. Switch back to Ashan to verify. The balance decreases by the verified amount. Repeat for the remainder to settle it.
5. **Groups:** open The Boarding House, add an equal/custom expense, and inspect automatically netted balances. In **Fund**, submit a contribution, then switch to another admin to confirm receipt. Admins cannot approve their own contributions.
6. **Approval:** as Ashan, request Campus Crew membership; switch to Dilshan, open Campus Crew → Members and approve it. Membership and financial actions are also validated on the backend.
7. **Canonical group loans:** request a loan from a group member in the group Loans tab. It also appears under both participants' My Loans. Group members can see group loans; only participants can perform loan actions. Leaving a group preserves all loans and repayment access. The last admin must appoint another admin before leaving.

## Daily spending, accounts and group invitations

- **Home / My Balance → Set daily limit:** save a private daily allowance. The card is green below 75% (including half used), orange at 75% to below 100%, and red at 100% or more. Daily, weekly (Monday through today), and current-month totals sit below the balance. Future-dated entries and transfers between your own accounts do not count as spending; shared expenses count only your share.
- **My Balance → Your accounts → Add money:** add income to Wallet, Bank or Savings at any time, including partway through a month. Existing Cash records are displayed and counted as Wallet, with no data reset.
- **Record friend payment:** save the friend, source account, amount, date and note/bank reference. Payments/gifts count as spending; loan/repayment cash movements reduce the account but do not count as spending again. This is a private record of an external payment; it does not move real bank money or bypass the verified loan flow. These fields also appear in the CSV report.
- **Group → Invite a friend:** select an accepted friend. They receive an in-app notification and an invitation in Groups. The recipient must accept. An active admin's invitation joins them immediately; an ordinary member's invitation requires admin approval after acceptance. Inviter membership/role is checked again at acceptance.
- **Group → Generate join link:** copy a reusable link valid for seven days. Anyone signed in with it can request membership, including for a private group, but cannot view group finances until approved. Admins can reset all shared links; a link also stops working when its creator leaves. Raw link tokens are never included in data snapshots or directly readable from Firestore.
- Demo links work only with the same browser's saved demo data. Sharing between devices requires your configured Firebase app at a publicly accessible HTTPS URL; localhost is not a public invitation address.

## Firebase setup

The UI automatically uses Firebase when all four required public configuration values are present. It never falls back to the demo on a Firebase error. These web configuration values identify the project; do not place Admin SDK credentials in public environment variables.

1. Create a Firebase project and web app. Enable Firestore in Native mode and **Authentication → Phone**. Configure SMS regions, authorized domains and Firebase test phone numbers. Add your local host to authorized domains as needed. Enable Google only if account linking is desired. Firebase SMS and deployed functions may require billing.
2. Copy `.env.example` to `.env.local` and set the four Firebase web values. Keep `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION=asia-south1`, matching the functions. Restart Next after changing environment values.
3. Select your project and install the functions dependencies:

   ```sh
   npx firebase login
   npx firebase use --add
   npm --prefix functions install
   ```

4. Set a random server-only secret for verification-code HMACs. At the prompt, provide at least 32 random bytes encoded as hex/base64. Never use the sample demo code as this secret.

   ```sh
   npx firebase functions:secrets:set VERIFICATION_SECRET
   ```

5. Deploy the rules, indexes and functions to **your selected project**:

   ```sh
   npx firebase deploy --only firestore,functions
   ```

6. Run the Next app locally, or build and host it on an HTTPS Node-compatible host:

   ```sh
   npm run build
   npm start
   ```

The repository is supplied ready for configuration; no cloud project has been created, deployed, billed or modified for you. Real SMS sign-in and Google provider linking require your Firebase project and were not exercised against live accounts.

### Identity invariant

Phone OTP is the only sign-in entry point. A verified user can select **Link Google to this account**, which calls `linkWithPopup(existingPhoneUser, GoogleAuthProvider)`, never Google sign-in or account creation. A provider already linked to another UID is rejected without switching accounts or merging balances. UID equality and a phone identity are checked. Backend calls require the Firebase `phone_number` claim. The profile document ID is always `request.auth.uid`. Public profiles contain no phone numbers. See [Firebase account linking](https://firebase.google.com/docs/auth/web/account-linking) and [phone authentication](https://firebase.google.com/docs/auth/web/phone-auth).

### Local Firebase emulators

Java 21+ is required. Copy `.env.example` to `.env.local`, supply emulator web config (`projectId=demo-settle`, `authDomain=demo-settle.firebaseapp.com`, an emulator-only API key/app ID), and set `NEXT_PUBLIC_USE_EMULATORS=true`. Create `functions/.secret.local` containing `VERIFICATION_SECRET=an-emulator-only-random-secret` (ignored by Git).

```sh
npm --prefix functions install
npm run functions:build
npx firebase emulators:start --project demo-settle --only auth,firestore,functions
```

In another terminal, run `npm run dev`. The Auth emulator prints SMS codes instead of sending messages. Register two phone users in separate browser profiles, set their names/handles, then connect as friends. Emulator mode starts with an empty database; the browser demo data is never uploaded. The demo user selector is absent in Firebase mode.

## Verification and trust

- Every money amount is a positive safe integer in minor units (100 = LKR 1). Custom split amounts must total the expense exactly. Equal splits allocate remainder cents deterministically.
- Loans follow requested → accepted → transfer pending → active → partial → settled; decline is available before acceptance. Repayment does not change the loan state until verified.
- The sender starts a transfer after arranging payment outside the app. Only the receiving participant can generate a six-digit cryptographically random code after attesting receipt. Only the sender can redeem it. Real codes are stored only as server-secret HMACs and returned only to the receiver who generated them.
- Codes expire at five minutes, allow five failed attempts and are consumed once. Failed attempts commit even when the response reports an error. Receiver-only rotation is limited to once per minute; it invalidates the previous code. Each loan has at most one pending transfer. Transactions reject replay, overpayment, unauthorized roles and invalid transitions.
- Financial writes, repayments, audit events and trust events use a Cloud Function with Firestore transactions. Client Firestore writes are denied everywhere. The callable returns a permission-filtered snapshot and never returns stored code hashes.
- **Time interpretation:** the grace period is exactly 72 elapsed hours from activation. A deduction is applied for each **complete** 24-hour period after grace; the first deduction is therefore at 96 hours. Example: activated September 1 at noon → grace ends September 4 at noon → first 0.1-point deduction September 5 at noon. The earlier conversation's calendar-date example was ambiguous; this implementation explicitly uses completed elapsed days.
- Trust is stored in integer tenths of a percentage point: 1000 = 100.0%, event delta −1 = −0.1 percentage points. The score is `clamp(1000 + sum(events.delta), 0, 1000)`.
- Events have deterministic `loanId_dayNumber` IDs. Repeated scheduled or request-time accrual cannot apply the same day twice. Settlement accrues any due events in the same transaction, then freezes the cutoff. Past deductions never disappear. Partial repayment leaves the overdue clock running.
- The scheduler runs hourly; reads and commands also accrue to the current server time. The UI refreshes once per minute. Unsettled group expense balances are separate from loans and do not affect trust.

## Personal versus group accounting

Personal entries are private. A group expense may optionally create exactly one source-linked cash entry for its payer. If you pay LKR 900 for three equal shares, cash decreases by LKR 900, your spending report shows LKR 300, and the group owes you LKR 600. Transfers between your accounts do not affect spending.

Group debts are derived from immutable expense splits, offsetting reciprocal and circular expense debts while preserving each member's net position. This is a suggested settlement schedule, not a unilateral declaration that money moved. Group fund contributions are tracked separately from expense balances. Contributions require another admin's receipt confirmation. Loan and contribution payments are not automatically imported into personal cash flow in this MVP; record those privately if desired. No bank transfer, card charge or payment rail is integrated.

## PWA and iPhone

Includes an App Router manifest, 192/512px icons, an Apple touch icon, standalone display, viewport-fit and safe-area padding. On iPhone Safari, use **Share → Add to Home Screen**; on supported desktop/Android browsers use the Profile install action. HTTPS is required outside localhost. The service worker caches only the offline screen and icons. It deliberately does not cache authenticated pages or financial responses, and never queues financial writes offline. See [Next.js PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps).

## Checks

```sh
npm test                  # domain and identity invariants
npm run typecheck
npm run functions:build
npm run build
npx playwright install chromium
npm run test:e2e           # desktop and iPhone-size Chromium flows
npm run test:rules         # Firestore emulator authorization tests (Java needed)
npm run test:integration   # actual Auth + Firestore + callable transaction flows
npm run format:check
```

To use an existing Chrome installation instead of downloading Chromium, set `PLAYWRIGHT_CHANNEL=chrome` before running browser tests. The iPhone project tests touch layout and mobile viewport in Chromium; this does not replace testing on a physical iPhone/Safari.

The integration runner targets only `demo-settle`, uses a separate Firestore port (8180), and allows 60 seconds for function discovery on slower machines. It creates an ignored emulator-only secret file if one does not already exist. Check the emulator ports are free before running. See [validation results](docs/VALIDATION.md) for the checks performed and their limits.

## Structure

```text
src/app/                  Next app, responsive styling, manifest
src/components/           Screens, phone sign-in, state adapter and forms
src/lib/model.ts          Typed collection records and currency parsing
src/lib/engine.ts         Shared domain commands, authorization and projection
src/lib/finance.ts        Netting, splits, reporting, trust-day calculations
src/lib/firebase.ts       Phone-account linking and callable transport
src/lib/seed.ts           Safe demo fixtures
functions/src/index.ts    Trusted transactions, rate limits, scheduled trust
firestore.rules           Read permissions; all client writes denied
firestore.indexes.json    Indexes for participant/group/date queries
tests/, e2e/              Financial rules and browser flows
docs/SCHEMA.md            Data model and repository limits
```

## MVP boundaries

This is runnable evaluation software. The Firebase repository uses serializable aggregate transactions to keep the cross-collection domain rules simple and correct. It intentionally stops at **400 documents per collection** or **440 changed documents in one transaction**. Every request scans the bounded collections, so it is suitable for a small pilot, not a large public deployment. Before growth, replace the adapter with participant/group-scoped reads, paginated views and per-loan scheduled accrual; retain the tested domain invariants. See the schema document for details.

Notifications are in-app and refresh on actions or the periodic refresh; no push/SMS notifications are sent apart from Firebase login OTP. Edits/deletes of confirmed financial records, refunds/reversals, dispute resolution, recovery from a recycled/lost phone number, multiple currencies and external payment processing are outside this MVP. Demo storage is one local browser dataset and does not synchronize concurrent tabs. The production adapter provides transactional concurrency and has passed local emulator integration tests. It still requires Firebase configuration and live sign-in validation in your deployment environment.
