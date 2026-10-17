import "server-only";
import { createClient } from "@/lib/supabase/server";
import { migrate, seed } from "./data";
import type { BillingData } from "./types";

/** Loads the signed-in user's data, creating it from the sample data on first sign-in. */
export async function loadOrSeed(): Promise<{ email: string; data: BillingData } | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: row, error } = await supabase.from("billing_data").select("data").eq("user_id", auth.user.id).maybeSingle();
  if (error) throw new Error("Could not load your data: " + error.message);
  if (row) return { email: auth.user.email ?? "", data: migrate(row.data as BillingData) };
  const fresh = seed();
  fresh.meta.savedAt = Date.now();
  const { error: werr } = await supabase.from("billing_data").upsert({ user_id: auth.user.id, data: fresh });
  if (werr) throw new Error("Could not create your data: " + werr.message);
  return { email: auth.user.email ?? "", data: fresh };
}
