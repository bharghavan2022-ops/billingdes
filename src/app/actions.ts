"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { applyChanges } from "@/lib/billing/server";
import { TABLES, type Changes } from "@/lib/billing/rows";

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

const rowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
const changesSchema = z.object({
  settings: z.object({ v: z.number(), settings: z.record(z.string(), z.unknown()), meta: z.record(z.string(), z.unknown()) }).optional(),
  upserts: z.record(z.string(), z.array(rowSchema)),
  deletes: z.record(z.string(), z.array(z.string())),
});

/** Saves only what changed. Row level security (supabase/schema.sql) limits each user to their own rows. */
export async function saveChanges(changes: Changes): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = changesSchema.safeParse(changes);
    if (!parsed.success) return { ok: false, error: "Invalid save request." };
    const known = new Set<string>(TABLES);
    for (const k of [...Object.keys(parsed.data.upserts), ...Object.keys(parsed.data.deletes)]) if (!known.has(k)) return { ok: false, error: "Invalid save request." };
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, error: "Signed out. Sign in again." };
    const err = await applyChanges(supabase, parsed.data as Changes);
    return err ? { ok: false, error: err.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" };
  }
}
