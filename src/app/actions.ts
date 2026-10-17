"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { migrate } from "@/lib/billing/data";
import type { BillingData } from "@/lib/billing/types";

const credentials = z.object({ email: z.string().email("Enter a valid email."), password: z.string().min(6, "Password needs at least 6 characters.") });

export type AuthResult = { error?: string; notice?: string };

export async function signIn(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await createClient().auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };
  redirect("/");
}

export async function signUp(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await createClient().auth.signUp(parsed.data);
  if (error) return { error: error.message };
  if (!data.session) return { notice: "Account created. Confirm the email we sent, then sign in." };
  redirect("/");
}

export async function signOut() {
  await createClient().auth.signOut();
  redirect("/login");
}

/** Saves the signed-in user's whole data set. Row level security (supabase/schema.sql) limits each user to their own row. */
export async function saveData(data: BillingData): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Signed out. Sign in again." };
  const { error } = await supabase
    .from("billing_data")
    .upsert({ user_id: auth.user.id, data: migrate(data), updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}
