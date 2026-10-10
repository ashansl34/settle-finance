# Validation results

Validated locally on Windows with Node.js 24, installed Chrome and the Firebase emulators. Cloud Functions target Node.js 22; the emulator used the installed Node.js 24 runtime.

| Check                                   | Result                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| Next.js production build                | Passed                                                          |
| TypeScript checking                     | Passed                                                          |
| Cloud Functions TypeScript build        | Passed                                                          |
| Domain and identity tests               | 47 passed                                                       |
| Firestore rules tests                   | 6 passed against the real Firestore emulator                    |
| Browser flows                           | 10 desktop/mobile scenarios passed; invitation cases rerun after link handling fix |
| Auth + Firestore + callable integration | Passed against the real local emulators                         |
| Visual review                           | Desktop and iPhone-sized screenshots inspected                  |

## What was exercised

- Integer minor currency parsing, deterministic equal splits, reciprocal/circular netting and conservation of balances.
- Lender-only acceptance, receiver-only code generation, sender-only confirmation, code expiry, five-attempt lockout, rotation cooldown and replay rejection.
- Partial and full repayments, settlement timestamps, overpayment rejection and audit records.
- Trust at exact elapsed-time boundaries, deterministic event IDs, repeat accrual, score clamps and freezing deductions at settlement.
- Google linking against the Firebase adapter with a mocked provider: same UID retained, no phone identity rejected, provider collision rejected without fallback sign-in, changed UID rejected.
- Real Firestore rules: private personal entries, group membership reads, participant access after leaving a group, denied challenge/hash reads, denied direct financial writes and denied audit/trust tampering.
- Actual callable integration: phone OTP sign-in in the Auth emulator, authenticated commands, two concurrent code redemptions with exactly one success, private cash-flow filtering, partial/full repayment transactions, persisted wrong-code attempt counts and canonical group loans surviving departure.
- Browser: local entry persistence across reload, two-person loan activation, custom shared expense entry and exactly one linked payer cash record with the correct personal expense share.

## Limits of this validation

No real SMS was sent, no real Google account was linked, and no live Firebase project was deployed. Mobile browser checks use Chromium's iPhone viewport/touch emulation; physical iPhone/Safari installation and SMS sign-in need verification on the configured deployment. The hourly scheduler uses the same tested trust function but was not triggered by a live Cloud Scheduler job.

The pilot repository limit (400 records per collection / 440 changed documents per transaction) is intentional and documented in SCHEMA.md. No load or scale testing beyond the bounded MVP was performed.

## Follow-up feature checks

Daily budget thresholds, calendar spending periods, Bank/Wallet balances, private preferences, friend payment records, invitation roles, link expiry and revocation are covered by the updated tests. Browser checks cover spending colors and friend invitations/shared links on both viewports. Rules checks cover private preferences, invitation access and denied token reads. The earlier callable integration suite was not rerun for these new commands; the Cloud Functions build passed.

