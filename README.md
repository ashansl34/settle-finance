# Settle

A mobile-first finance MVP built with Next.js, TypeScript, Tailwind CSS and Supabase. It has Gmail/email link login, private per-user finance storage, daily limits, wallet/bank tracking, reports, friends/groups/loans UI, and a local demo mode when Supabase is not configured.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. If Supabase env values are empty, the app opens in local demo mode.

## Supabase setup

1. Create a Supabase project.
2. Open **Authentication → Providers → Google** and enable Google login.
3. Add these redirect URLs in Supabase Auth settings:
   - `http://localhost:3000`
   - your Vercel production URL later
3. Open **SQL Editor** and run `supabase/schema.sql`.
4. Copy `.env.example` to `.env.local` and fill:

```sh
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart the dev server.

## Vercel deploy

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add the two Supabase environment variables in Vercel project settings.
4. Deploy.
5. Copy the Vercel URL into Supabase Auth redirect URLs.

## Current backend mode

This card-free version stores each signed-in user's app state in their own Supabase row:

- Table: `app_states`
- Owner column: `user_id`
- Data column: `state jsonb`
- Row Level Security: users can only read/write their own row

This is safe for personal finance tracking and beta testing. Full real-time shared friends/groups/loans with cross-user verification should later move to normalized tables plus server-side transaction APIs.

## Checks

```sh
npm run typecheck
npm test -- --configLoader native
npm run build
```

## Notes

- Phone OTP is removed to avoid SMS cost.
- Gmail/email login link is the main identity.
- Amounts are stored as integer minor currency units inside the app state.
- The local demo stays in browser local storage and is not uploaded.
