/**
 * @supabase/supabase-js unconditionally constructs a realtime client the
 * moment any client is created, even when nothing ever opens a realtime
 * channel. That client's WebSocketFactory throws synchronously if no
 * global WebSocket constructor is available - true on Vercel's Edge
 * Runtime (explicitly rejected, see @supabase/realtime-js's
 * websocket-factory.ts) and on Node <22 (no native WebSocket global).
 * Call this before constructing any server-side Supabase client; it's a
 * no-op wherever a real WebSocket already exists, and the stub is never
 * actually connected to since nothing here uses realtime features.
 */
export function ensureWebSocketShim(): void {
  if (typeof globalThis.WebSocket === "undefined") {
    (globalThis as { WebSocket?: unknown }).WebSocket = class {} as unknown as typeof WebSocket;
  }
}
