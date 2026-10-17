export const DEFAULT_SUPABASE_URL = "https://ojyvvpczpgutsbksxjur.supabase.co";
// Public by design (sent to every browser). Never put a database password or a service_role/secret key here.
export const DEFAULT_SUPABASE_KEY = "sb_publishable_wRNP-tkgKqreQ7HSKlp5NA_7rxiaDZQ";

/** Strips what people often paste by mistake: spaces, quotes, and a leading "NAME=". */
export function cleanEnvValue(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^[A-Z][A-Z0-9_]*\s*=\s*/, "").replace(/^["'`]+|["'`]+$/g, "").trim();
}

const isHttpUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};
const looksLikeKey = (s: string) => /^sb_publishable_[\w-]{20,}$/.test(s) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(s);

/**
 * Uses the host's environment values only when BOTH are valid (so a URL and key from different projects are never mixed);
 * otherwise falls back to this project's public defaults.
 */
export function resolveSupabaseConfig(url: string | undefined, key: string | undefined) {
  const u = cleanEnvValue(url), k = cleanEnvValue(key);
  if (isHttpUrl(u) && looksLikeKey(k)) return { url: u.replace(/\/+$/, ""), key: k, fromEnv: true };
  return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_KEY, fromEnv: false };
}
