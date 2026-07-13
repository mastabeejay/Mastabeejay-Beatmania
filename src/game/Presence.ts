import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/** Realtime Presence, not a DB table — cheaper and always current, and the "BDJ Crews" directory
 *  that reads getOnlineMemberIds() is itself gated to logged-in members, so there's no reason for
 *  a guest-only visit to ever open this channel. */
let channel: RealtimeChannel | null = null;

/** Call after every login/signup/session-restore success — opens the shared presence channel on
 *  first use, or just re-tracks on it if a member was already online in this tab (e.g. profile
 *  save, which doesn't change the id). */
export function trackMemberOnline(memberId: number): void {
  if (!channel) {
    channel = supabase.channel("bdj-online-members", { config: { presence: { key: crypto.randomUUID() } } });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void channel?.track({ member_id: memberId });
    });
  } else {
    void channel.track({ member_id: memberId });
  }
}

/** Call on logout/withdraw — leaves the channel outright rather than just untracking, so a logged-
 *  out tab stops holding open a realtime connection it no longer needs. */
export function untrackMemberOnline(): void {
  if (!channel) return;
  void channel.unsubscribe();
  channel = null;
}

/** Ids of every member currently online in any connected tab (including this one). Empty when this
 *  tab was never logged in — there's then nothing subscribed to read presence from anyway. */
export function getOnlineMemberIds(): Set<number> {
  const ids = new Set<number>();
  if (!channel) return ids;
  const state = channel.presenceState<{ member_id: number }>();
  for (const presences of Object.values(state)) {
    for (const p of presences) ids.add(p.member_id);
  }
  return ids;
}
