-- Run once in Supabase: Dashboard > SQL Editor > New query.
-- One row per signed-in user holding that user's whole Billing Desk data.
create table if not exists public.billing_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.billing_data enable row level security;

drop policy if exists "own row select" on public.billing_data;
drop policy if exists "own row insert" on public.billing_data;
drop policy if exists "own row update" on public.billing_data;
drop policy if exists "own row delete" on public.billing_data;

create policy "own row select" on public.billing_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own row insert" on public.billing_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own row update" on public.billing_data for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row delete" on public.billing_data for delete to authenticated
  using ((select auth.uid()) = user_id);
