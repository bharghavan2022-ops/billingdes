-- Billing Desk schema. Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to run again: it only creates what is missing and refreshes the policies and function.
-- Every table is scoped to the signed-in user with row level security.

-- Business details, bank details, numbering and flags: one row per user.
create table if not exists public.settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  alt text,
  hsn text,
  unit text not null default '',
  rate numeric not null,
  gst numeric not null,
  low numeric not null,
  stock numeric not null,
  active boolean not null,
  code text,
  primary key (user_id, id)
);

create table if not exists public.customers (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  address text,
  mobile text,
  gstin text,
  pan text,
  state text,
  primary key (user_id, id)
);

create table if not exists public.invoices (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  no text not null,
  date date not null,
  due date,
  seller_id text,
  customer_id text,
  cust_name text,
  cust_address text,
  cust_mobile text,
  cust_gstin text,
  cust_pan text,
  ship_same boolean,
  ship_name text,
  ship_address text,
  pos text not null,
  intra boolean,
  round_off_on boolean,
  notes text,
  heading text,
  lang text,
  grand numeric not null,
  status text not null,
  created_at bigint not null,
  updated_at bigint,
  cancelled_at bigint,
  primary key (user_id, id),
  unique (user_id, no)
);

create table if not exists public.invoice_lines (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  invoice_id text not null,
  position integer not null,
  item_id text,
  name text not null,
  hsn text,
  unit text,
  qty numeric not null,
  rate numeric not null,
  disc numeric,
  gst numeric,
  primary key (user_id, id),
  foreign key (user_id, invoice_id) references public.invoices (user_id, id) on delete cascade
);

create table if not exists public.payments (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  invoice_id text not null,
  date date,
  amount numeric not null,
  mode text,
  note text,
  primary key (user_id, id),
  foreign key (user_id, invoice_id) references public.invoices (user_id, id) on delete cascade
);

create table if not exists public.stock_movements (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  ts bigint not null,
  date date,
  item_id text,
  name text not null,
  qty numeric not null,
  type text not null,
  ref text,
  note text,
  bal numeric not null,
  primary key (user_id, id)
);

-- Item codes (001, 002, ...). Added after the first version, so existing databases get the column here.
alter table public.items add column if not exists code text;
create unique index if not exists items_user_code_idx on public.items (user_id, code) where code is not null;

-- Which firm issued each bill (two firms can bill from one account). Existing bills stay empty and belong to the first firm.
alter table public.invoices add column if not exists seller_id text;
alter table public.invoices add column if not exists heading text;
alter table public.invoices add column if not exists lang text;

create index if not exists invoices_user_date_idx on public.invoices (user_id, date desc);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (user_id, invoice_id);
create index if not exists payments_invoice_idx on public.payments (user_id, invoice_id);
create index if not exists stock_movements_item_idx on public.stock_movements (user_id, item_id, ts);

-- Row level security: each user can only see and change their own rows.

alter table public.settings enable row level security;
drop policy if exists "own rows" on public.settings;
create policy "own rows" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.items enable row level security;
drop policy if exists "own rows" on public.items;
create policy "own rows" on public.items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.customers enable row level security;
drop policy if exists "own rows" on public.customers;
create policy "own rows" on public.customers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.invoices enable row level security;
drop policy if exists "own rows" on public.invoices;
create policy "own rows" on public.invoices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.invoice_lines enable row level security;
drop policy if exists "own rows" on public.invoice_lines;
create policy "own rows" on public.invoice_lines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.payments enable row level security;
drop policy if exists "own rows" on public.payments;
create policy "own rows" on public.payments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.stock_movements enable row level security;
drop policy if exists "own rows" on public.stock_movements;
create policy "own rows" on public.stock_movements for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- Applies one save in a single transaction: deletes (children first), then upserts (parents first).
-- p = { "settings": {...}, "deletes": { "<table>": ["id", ...] }, "upserts": { "<table>": [ {row}, ... ] } }
create or replace function public.apply_changes(p jsonb) returns void
language plpgsql security invoker set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p->'deletes'->'stock_movements' is not null then
    delete from public.stock_movements where user_id = auth.uid() and id in (select jsonb_array_elements_text(p->'deletes'->'stock_movements'));
  end if;
  if p->'deletes'->'payments' is not null then
    delete from public.payments where user_id = auth.uid() and id in (select jsonb_array_elements_text(p->'deletes'->'payments'));
  end if;
  if p->'deletes'->'invoice_lines' is not null then
    delete from public.invoice_lines where user_id = auth.uid() and id in (select jsonb_array_elements_text(p->'deletes'->'invoice_lines'));
  end if;
  if p->'deletes'->'invoices' is not null then
    delete from public.invoices where user_id = auth.uid() and id in (select jsonb_array_elements_text(p->'deletes'->'invoices'));
  end if;
  if p->'deletes'->'customers' is not null then
    delete from public.customers where user_id = auth.uid() and id in (select jsonb_array_elements_text(p->'deletes'->'customers'));
  end if;
  if p->'deletes'->'items' is not null then
    delete from public.items where user_id = auth.uid() and id in (select jsonb_array_elements_text(p->'deletes'->'items'));
  end if;
  if p->'settings' is not null then
    insert into public.settings (user_id, data) values (auth.uid(), p->'settings')
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;
  if p->'upserts'->'items' is not null then
    insert into public.items (user_id, id, name, alt, hsn, unit, rate, gst, low, stock, active, code)
    select auth.uid(), r.id, r.name, r.alt, r.hsn, r.unit, r.rate, r.gst, r.low, r.stock, r.active, r.code from jsonb_populate_recordset(null::public.items, p->'upserts'->'items') r
    on conflict (user_id, id) do update set name = excluded.name, alt = excluded.alt, hsn = excluded.hsn, unit = excluded.unit, rate = excluded.rate, gst = excluded.gst, low = excluded.low, stock = excluded.stock, active = excluded.active, code = excluded.code;
  end if;
  if p->'upserts'->'customers' is not null then
    insert into public.customers (user_id, id, name, address, mobile, gstin, pan, state)
    select auth.uid(), r.id, r.name, r.address, r.mobile, r.gstin, r.pan, r.state from jsonb_populate_recordset(null::public.customers, p->'upserts'->'customers') r
    on conflict (user_id, id) do update set name = excluded.name, address = excluded.address, mobile = excluded.mobile, gstin = excluded.gstin, pan = excluded.pan, state = excluded.state;
  end if;
  if p->'upserts'->'invoices' is not null then
    insert into public.invoices (user_id, id, no, date, due, seller_id, customer_id, cust_name, cust_address, cust_mobile, cust_gstin, cust_pan, ship_same, ship_name, ship_address, pos, intra, round_off_on, notes, heading, lang, grand, status, created_at, updated_at, cancelled_at)
    select auth.uid(), r.id, r.no, r.date, r.due, r.seller_id, r.customer_id, r.cust_name, r.cust_address, r.cust_mobile, r.cust_gstin, r.cust_pan, r.ship_same, r.ship_name, r.ship_address, r.pos, r.intra, r.round_off_on, r.notes, r.heading, r.lang, r.grand, r.status, r.created_at, r.updated_at, r.cancelled_at from jsonb_populate_recordset(null::public.invoices, p->'upserts'->'invoices') r
    on conflict (user_id, id) do update set no = excluded.no, date = excluded.date, due = excluded.due, seller_id = excluded.seller_id, customer_id = excluded.customer_id, cust_name = excluded.cust_name, cust_address = excluded.cust_address, cust_mobile = excluded.cust_mobile, cust_gstin = excluded.cust_gstin, cust_pan = excluded.cust_pan, ship_same = excluded.ship_same, ship_name = excluded.ship_name, ship_address = excluded.ship_address, pos = excluded.pos, intra = excluded.intra, round_off_on = excluded.round_off_on, notes = excluded.notes, heading = excluded.heading, lang = excluded.lang, grand = excluded.grand, status = excluded.status, created_at = excluded.created_at, updated_at = excluded.updated_at, cancelled_at = excluded.cancelled_at;
  end if;
  if p->'upserts'->'invoice_lines' is not null then
    insert into public.invoice_lines (user_id, id, invoice_id, position, item_id, name, hsn, unit, qty, rate, disc, gst)
    select auth.uid(), r.id, r.invoice_id, r.position, r.item_id, r.name, r.hsn, r.unit, r.qty, r.rate, r.disc, r.gst from jsonb_populate_recordset(null::public.invoice_lines, p->'upserts'->'invoice_lines') r
    on conflict (user_id, id) do update set invoice_id = excluded.invoice_id, position = excluded.position, item_id = excluded.item_id, name = excluded.name, hsn = excluded.hsn, unit = excluded.unit, qty = excluded.qty, rate = excluded.rate, disc = excluded.disc, gst = excluded.gst;
  end if;
  if p->'upserts'->'payments' is not null then
    insert into public.payments (user_id, id, invoice_id, date, amount, mode, note)
    select auth.uid(), r.id, r.invoice_id, r.date, r.amount, r.mode, r.note from jsonb_populate_recordset(null::public.payments, p->'upserts'->'payments') r
    on conflict (user_id, id) do update set invoice_id = excluded.invoice_id, date = excluded.date, amount = excluded.amount, mode = excluded.mode, note = excluded.note;
  end if;
  if p->'upserts'->'stock_movements' is not null then
    insert into public.stock_movements (user_id, id, ts, date, item_id, name, qty, type, ref, note, bal)
    select auth.uid(), r.id, r.ts, r.date, r.item_id, r.name, r.qty, r.type, r.ref, r.note, r.bal from jsonb_populate_recordset(null::public.stock_movements, p->'upserts'->'stock_movements') r
    on conflict (user_id, id) do update set ts = excluded.ts, date = excluded.date, item_id = excluded.item_id, name = excluded.name, qty = excluded.qty, type = excluded.type, ref = excluded.ref, note = excluded.note, bal = excluded.bal;
  end if;
end;
$fn$;

grant execute on function public.apply_changes(jsonb) to authenticated;


-- The earlier version of the app kept everything in one document in public.billing_data.
-- If that table exists, the app copies its data into the tables above the first time you sign in.
-- It is left untouched as a backup; once you have checked your data you can drop it with: drop table public.billing_data;
