"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

// Realtime checks RLS with the token the socket joined with. Load the session
// and hand its token to realtime before subscribing, or the channel joins as
// anonymous and every row is filtered out. Callers use a unique channel name:
// the client reuses channels by name, and React may run an effect twice.
export async function subscribeAuthed(
  supabase: SupabaseClient,
  build: (client: SupabaseClient) => RealtimeChannel,
): Promise<RealtimeChannel> {
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
  return build(supabase).subscribe();
}
