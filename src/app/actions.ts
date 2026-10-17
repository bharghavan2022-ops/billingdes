"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { applyChanges } from "@/lib/billing/server";
import { TABLES, type Changes } from "@/lib/billing/rows";

export type AuthResult = { error?: string; notice?: string };

/** Turns Supabase's terse auth errors into something a person can act on. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password. If you just created this account, open the confirmation email we sent and click the link first.";
  if (m.includes("email not confirmed")) return "This email isn't confirmed yet. Open the confirmation email and click the link, then sign in.";
  if (m.includes("rate limit")) return "Too many emails were sent recently. Wait a few minutes and try again, or ask the site owner to turn off email confirmation.";
  if (m.includes("already registered") || m.includes("already been registered")) return "This email is already registered. Use Sign in instead.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "New accounts are turned off for this site.";
  if (m.includes("password") && m.includes("characters")) return "Password needs at least 6 characters.";
  return message;
}

const credentials = z.object({ email: z.string().trim().email("Enter a valid email address."), password: z.string().min(6, "Password needs at least 6 characters.") });

/** One action for both buttons: the clicked button's value ("signin" or "signup") arrives as `intent`. */
export async function authenticate(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const intent = form.get("intent") === "signup" ? "signup" : "signin";
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!supabaseUrl || !supabaseKey) return { error: "Supabase is not configured on the server (missing environment variables)." };

  let signedIn = false;
  try {
    const supabase = createClient();
    if (intent === "signup") {
      const { data, error } = await supabase.auth.signUp(parsed.data);
      if (error) return { error: friendly(error.message) };
      // Supabase answers an already-registered email with a user that has no identities (and sends nothing).
      if (data.user && data.user.identities?.length === 0) return { error: "This email is already registered. Use Sign in instead." };
      if (!data.session) return { notice: `Account created. We sent a confirmation email to ${parsed.data.email}. Click the link in it, then come back and sign in. (Check spam if you don't see it.)` };
      signedIn = true;
    } else {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) return { error: friendly(error.message) };
      signedIn = true;
    }
  } catch (e) {
    return { error: "Could not reach Supabase: " + (e instanceof Error ? e.message : String(e)) };
  }
  if (signedIn) redirect("/");
  return {};
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
