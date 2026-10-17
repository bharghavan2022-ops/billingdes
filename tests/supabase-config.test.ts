import { describe, expect, it } from "vitest";
import { DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL, cleanEnvValue, resolveSupabaseConfig } from "@/lib/supabase/config";

const goodKey = "sb_publishable_abcdefghijklmnopqrstuvwx";
describe("resolveSupabaseConfig", () => {
  it("uses valid environment values", () => {
    expect(resolveSupabaseConfig("https://abc.supabase.co", goodKey)).toEqual({ url: "https://abc.supabase.co", key: goodKey, fromEnv: true });
  });
  it("repairs common paste mistakes", () => {
    expect(cleanEnvValue('NEXT_PUBLIC_SUPABASE_URL="https://abc.supabase.co/" ')).toBe('https://abc.supabase.co/');
    expect(resolveSupabaseConfig('NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co/', ` "${goodKey}" `).url).toBe("https://abc.supabase.co");
  });
  it("falls back to the defaults for empty or invalid values, never mixing projects", () => {
    const d = { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_KEY, fromEnv: false };
    expect(resolveSupabaseConfig(undefined, undefined)).toEqual(d);
    expect(resolveSupabaseConfig("abc.supabase.co", goodKey)).toEqual(d);        // no https://
    expect(resolveSupabaseConfig("db.abc.supabase.co:5432", goodKey)).toEqual(d); // database host, not the API URL
    expect(resolveSupabaseConfig("https://abc.supabase.co", "sb_publishable_wRNP")).toEqual(d); // truncated key
  });
});
