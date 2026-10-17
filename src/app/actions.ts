"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { migrate } from "@/lib/billing/data";
import type { BillingData } from "@/lib/billing/types";

const credentials = z.object({ email: z.string().email("Enter a valid email."), password: z.string().min(6, "Password needs at least 6 characters.") });

/** Runs a Supabase auth call and turns configuration or network failures into a message instead of a crashed page. */
async function tryAuth(fn: (c: ReturnType<typeof createClient>) => PromiseLike<{ error: { message: string } | null }>): Promise<AuthResult | null> {
  if (!supabaseUrl || !supabaseKey) return { error: "Supabase is not configured on the server (missing environment variables)." };
  try {
    const { error } = await fn(createClient());
    return error ? { error: error.message } : null;
  } catch (e) {
    return { error: "Could not reach Supabase: " + (e instanceof Error ? e.message : String(e)) };
  }
}

export type AuthResult = { error?: string; notice?: string };

export async function signIn(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const failed = await tryAuth((c) => c.auth.signInWithPassword(parsed.data));
  if (failed) return failed;
  redirect("/");
}

export async function signUp(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let confirmed = false;
  const failed = await tryAuth(async (c) => {
    const r = await c.auth.signUp(parsed.data);
    confirmed = !!r.data.session;
    return r;
  });
  if (failed) return failed;
  if (!confirmed) return { notice: "Account created. Confirm the email we sent, then sign in." };
  redirect("/");
}

export async function signOut() {
  await createClient().auth.signOut();
  redirect("/login");
}

/** Saves the signed-in user's whole data set. Row level security (supabase/schema.sql) limits each user to their own row. */
export async function saveData(data: BillingData): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, error: "Signed out. Sign in again." };
    const { error } = await supabase
      .from("billing_data")
      .upsert({ user_id: auth.user.id, data: migrate(data), updated_at: new Date().toISOString() });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" };
  }
}
