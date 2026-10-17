import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "./env";
import { ensureWebSocketShim } from "./websocket-shim";

const PUBLIC_PATHS = ["/login"];

/** Keeps the Supabase session cookie fresh and sends signed-out visitors to /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseUrl || !supabaseKey) return response;

  try {
    ensureWebSocketShim(); // the Edge runtime has no WebSocket and the Supabase client throws without one
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
    if (!data.user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (data.user && isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  } catch (error) {
    // Never take the whole site down because the session refresh failed. The pages re-check the user themselves
    // (the app layout redirects signed-out visitors to /login), so letting the request through is safe.
    console.error({ operation: "middleware.updateSession", error: error instanceof Error ? error.message : String(error) });
  }
  return response;
}
