# Billing Desk

GST billing and stock for a small business. Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Auth + Postgres with row level security).

Features: GST invoices (CGST/SGST or IGST), amount in words, printable original/duplicate/triplicate copies, payments and status, stock with a movement ledger, customers, CSV export, backup and restore, Tamil item names.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and publishable key (Project Settings > API). Never put the database password or a secret key in these.
3. In the Supabase SQL Editor run `supabase/schema.sql` (creates `billing_data` with row level security: each user only sees their own row).
4. Authentication > Providers: keep Email enabled (turn off "Confirm email" for quick testing).
5. `npm run dev` and open http://localhost:3000. Create an account on the sign-in page; the first sign-in loads sample data from bill no. 49 (clear it in Settings).

## Item codes, HSN and GST

Every item has a serial code. The 101 standard items found in the temple indents hold codes `001`-`101`, each with its HSN (4 digits) and usual GST rate; unit and rate are entered by you. Items you add later get `102`, `103`, ... automatically. On the Items page, **Load 101 standard items** adds them (an item you already have with the same name keeps its details and takes the catalogue code; the same button fills HSN and GST on standard items loaded earlier, and never overwrites values you set). Picking an item on a bill fills the line's HSN and GST automatically.

The GST rates are best-effort. Items marked `*` in [`docs/item-catalogue.pdf`](docs/item-catalogue.pdf) must be verified, and `†` rates depend on packing (pre-packed, branded goods are 5%, loose goods are nil). Check every rate with your tax consultant before billing. The data lives in `src/lib/billing/catalogue.ts`.

After updating, re-run `supabase/schema.sql` once in the Supabase SQL Editor (it adds the `code` column and updates the save function).

## Stock

Stock tracking is **off by default**: bills never change stock and the stock screens, alerts and fields are hidden. Turn it on in Settings > Stock and totals (Track stock) to get stock levels, low-stock alerts, adjustments and history.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`

## Structure

- `src/app/(app)/`: pages for home, new/edit/copy bill, invoices, items, customers, settings
- `src/app/login`, `src/app/actions.ts`: sign-in/up/out and the save server action
- `src/lib/billing/`: pure billing logic (GST maths, stock, status) with unit tests in `tests/`
- `src/lib/supabase/`: browser, server and middleware clients (`src/middleware.ts` keeps the session fresh and redirects signed-out visitors to `/login`)
- `src/components/`: UI (provider that syncs to Supabase, invoice editor, paper/print, dialogs)

## Data model

Real tables, all with row level security so each user only sees their own rows (`supabase/schema.sql`):

| Table | Holds |
|---|---|
| `settings` | one row: business and bank details, numbering, flags |
| `items` | products with rate, GST, stock level |
| `customers` | saved customers |
| `invoices` | one row per bill (customer snapshot, totals, status) |
| `invoice_lines` | the items on each bill (deleted with the bill) |
| `payments` | payments received against a bill (deleted with the bill) |
| `stock_movements` | the stock ledger (sale, edit, cancel, purchase, return, damage, count, opening) |

The app keeps a working copy in the browser and, about a second after each edit, sends only the rows that changed. The database applies each save in one transaction (`apply_changes`), so a bill, its stock movements and its payment are never half saved. There is no size limit on the account. If the same account is open on two devices at once, the last save wins.

**Upgrading from the single-document version:** run the new `supabase/schema.sql`, then sign in. If your old `billing_data` table has data, it is copied into the new tables automatically the first time. `billing_data` is left untouched as a backup; drop it once you have checked everything (`drop table public.billing_data;`).
