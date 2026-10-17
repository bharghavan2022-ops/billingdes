import { resolveSupabaseConfig } from "./config";

// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY override the defaults when both are valid (see config.ts).
const cfg = resolveSupabaseConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const supabaseUrl = cfg.url;
export const supabaseKey = cfg.key;
