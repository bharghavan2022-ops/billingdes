// The project URL and publishable key are public by design (they are sent to every browser), so they are safe to keep here as defaults.
// Setting NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your host or .env.local overrides them (use that to point at another project).
// Never put the database password or a service_role/secret key in this file or in a NEXT_PUBLIC_ variable.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ojyvvpczpgutsbksxjur.supabase.co";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_wRNP-tkgKqreQ7HSKlp5NA_7rxiaDZQ";
