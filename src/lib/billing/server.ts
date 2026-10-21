import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { defaults, migrate, seed } from "./data";
import { chunkChanges, diffAgainst, fromRows, settingsDocOf, snapshotOf, type Changes, type LoadedRows, type SettingsDoc, type TableName } from "./rows";
import type { BillingData } from "./types";

export type LoadResult =
  | { ok: true; email: string; data: BillingData }
  | { ok: false; signedOut?: boolean; title: string; detail: string; fix: string };

const PAGE = 1000; // Supabase returns at most 1,000 rows per request
const ORDER: Record<TableName, string[]> = {
  items: ["id"], customers: ["id"], invoices: ["created_at", "id"], invoice_lines: ["invoice_id", "position"], payments: ["id"], stock_movements: ["ts", "id"],
};

/** Reads every row of a table, 1,000 at a time (the remaining pages are fetched in parallel). */
async function fetchAll(supabase: SupabaseClient, table: TableName): Promise<Record<string, unknown>[]> {
  const page = (from: number, count?: boolean) => {
    let q = supabase.from(table).select("*", count ? { count: "exact" } : undefined);
    for (const col of ORDER[table]) q = q.order(col);
    return q.range(from, from + PAGE - 1);
  };
  const first = await page(0, true);
  if (first.error) throw first.error;
  const rows = (first.data ?? []) as Record<string, unknown>[];
  const total = first.count ?? rows.length;
  const jobs: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>[] = [];
  for (let from = PAGE; from < total; from += PAGE) jobs.push(page(from));
  for (const r of await Promise.all(jobs)) {
    if (r.error) throw r.error;
    rows.push(...((r.data ?? []) as Record<string, unknown>[]));
  }
  return rows;
}

/** Sends change pieces one after another; each piece is applied by the database in one transaction. */
export async function applyChanges(supabase: SupabaseClient, changes: Changes) {
  for (const piece of chunkChanges(changes)) {
    const { error } = await supabase.rpc("apply_changes", { p: piece });
    if (error) return error;
  }
  return null;
}

/** Loads the signed-in user's data. First sign-in copies the old single-document data if it exists, otherwise creates sample data. Never throws. */
export async function loadOrSeed(): Promise<LoadResult> {
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, title: "Supabase is not configured", detail: "NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing on the server.", fix: "Add both variables in your hosting settings (Vercel: Project > Settings > Environment Variables), then redeploy." };
  }
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, signedOut: true, title: "Signed out", detail: "", fix: "" };
    const email = auth.user.email ?? "";

    const { data: srow, error: serr } = await supabase.from("settings").select("data").eq("user_id", auth.user.id).maybeSingle();
    if (serr) return dbProblem(serr.message, serr.code);

    if (srow) {
      const [items, customers, invoices, invoice_lines, payments, stock_movements] = await Promise.all(
        (["items", "customers", "invoices", "invoice_lines", "payments", "stock_movements"] as TableName[]).map((t) => fetchAll(supabase, t)),
      );
      const loaded: LoadedRows = { settings: srow.data as SettingsDoc, items, customers, invoices, invoice_lines, payments, stock_movements };
      return { ok: true, email, data: fromRows(loaded) };
    }

    // First sign-in on the new tables: bring over the old document if there is one.
    const legacy = await supabase.from("billing_data").select("data").eq("user_id", auth.user.id).maybeSingle();
    const legacyMissing = legacy.error && (legacy.error.code === "42P01" || legacy.error.code === "PGRST205");
    if (legacy.error && !legacyMissing) return dbProblem(legacy.error.message, legacy.error.code);
    const data = legacy.data ? migrate(legacy.data.data as BillingData) : seed(false);

    const { changes } = diffAgainst(snapshotOf(defaults()).snap, data);
    changes.settings = settingsDocOf(data);
    const err = await applyChanges(supabase, changes);
    if (err) return dbProblem(err.message, err.code);
    return { ok: true, email, data };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    if (err.code) return dbProblem(err.message ?? "", err.code);
    return { ok: false, title: "Could not reach Supabase", detail: err.message ?? String(e), fix: "Check that the project URL is correct and the project is not paused." };
  }
}

function dbProblem(message: string, code?: string): LoadResult {
  const missing = code === "42P01" || code === "PGRST205" || code === "PGRST202" || /schema cache|does not exist|apply_changes/i.test(message);
  return missing
    ? { ok: false, title: "The database tables are missing", detail: message, fix: "In Supabase open SQL Editor, paste the contents of supabase/schema.sql from the repository, and run it. Then reload this page." }
    : { ok: false, title: "Could not load your data", detail: message, fix: "Check the Supabase project is running and the row level security policies from supabase/schema.sql are applied." };
}
