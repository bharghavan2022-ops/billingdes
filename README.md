# Billing Desk

GST billing and stock for a small business. Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Auth + Postgres with row level security).

Features: GST invoices (CGST/SGST or IGST), amount in words, printable original/duplicate/triplicate copies, payments and status, stock with a movement ledger, customers, CSV export, backup and restore, Tamil item names.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and publishable key (Project Settings > API). Never put the database password or a secret key in these.
3. In the Supabase SQL Editor run `supabase/schema.sql` (creates `billing_data` with row level security: each user only sees their own row).
4. Authentication > Providers: keep Email enabled (turn off "Confirm email" for quick testing).
5. `npm run dev` and open http://localhost:3000. Create an account on the sign-in page; the first sign-in loads sample data from bill no. 49 (clear it in Settings).

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`

## Structure

- `src/app/(app)/`: pages for home, new/edit/copy bill, invoices, items, customers, settings
- `src/app/login`, `src/app/actions.ts`: sign-in/up/out and the save server action
- `src/lib/billing/`: pure billing logic (GST maths, stock, status) with unit tests in `tests/`
- `src/lib/supabase/`: browser, server and middleware clients (`src/middleware.ts` keeps the session fresh and redirects signed-out visitors to `/login`)
- `src/components/`: UI (provider that syncs to Supabase, invoice editor, paper/print, dialogs)

## Data model

Each user's data is one JSON document in `billing_data.data` (items, customers, invoices, stock ledger, settings). Changes are saved about a second after each edit. If the same account is open on two devices at once, the last save wins, so use one device at a time. Splitting this into separate tables is possible later without changing the screens.
