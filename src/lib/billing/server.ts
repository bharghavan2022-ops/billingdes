import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { migrate, seed } from "./data";
import type { BillingData } from "./types";

export type LoadResult =
  | { ok: true; email: string; data: BillingData }
  | { ok: false; signedOut?: boolean; title: string; detail: string; fix: string };

/** Loads the signed-in user's data, creating it from the sample data on first sign-in. Never throws: setup problems come back as a message the page can show. */
export async function loadOrSeed(): Promise<LoadResult> {
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, title: "Supabase is not configured", detail: "NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing on the server.", fix: "Add both variables in your hosting settings (Vercel: Project > Settings > Environment Variables), then redeploy." };
  }
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, signedOut: true, title: "Signed out", detail: "", fix: "" };
    const email = auth.user.email ?? "";
    const { data: row, error } = await supabase.from("billing_data").select("data").eq("user_id", auth.user.id).maybeSingle();
    if (error) return dbProblem(error.message, error.code);
    if (row) return { ok: true, email, data: migrate(row.data as BillingData) };
    const fresh = seed();
    fresh.meta.savedAt = Date.now();
    const { error: werr } = await supabase.from("billing_data").upsert({ user_id: auth.user.id, data: fresh });
    if (werr) return dbProblem(werr.message, werr.code);
    return { ok: true, email, data: fresh };
  } catch (e) {
    return { ok: false, title: "Could not reach Supabase", detail: e instanceof Error ? e.message : String(e), fix: "Check that the project URL is correct and the project is not paused." };
  }
}

function dbProblem(message: string, code?: string): LoadResult {
  const missingTable = code === "42P01" || code === "PGRST205" || /billing_data|schema cache|does not exist/i.test(message);
  return missingTable
    ? { ok: false, title: "The database table is missing", detail: message, fix: "In Supabase open SQL Editor, paste the contents of supabase/schema.sql from the repository, and run it. Then reload this page." }
    : { ok: false, title: "Could not load your data", detail: message, fix: "Check the Supabase project is running and the row level security policies from supabase/schema.sql are applied." };
}
