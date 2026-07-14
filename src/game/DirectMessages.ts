import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export interface DirectMessage {
  id: number;
  senderId: number;
  recipientId: number;
  message: string;
  dateIso: string;
}

interface DirectMessageRow {
  id: number;
  sender_id: number;
  recipient_id: number;
  message: string;
  created_at: string;
}

function toMessage(row: DirectMessageRow): DirectMessage {
  return { id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, message: row.message, dateIso: row.created_at };
}

export async function sendDirectMessage(name: string, password: string, recipientId: number, message: string): Promise<DirectMessage> {
  const { data, error } = await supabase.rpc("send_direct_message", {
    p_name: name,
    p_password: password,
    p_recipient_id: recipientId,
    p_message: message,
  });
  if (error) throw new Error(error.message);
  return toMessage(data as DirectMessageRow);
}

export async function loadDirectMessages(name: string, password: string, otherMemberId: number): Promise<DirectMessage[]> {
  const { data, error } = await supabase.rpc("load_direct_messages", {
    p_name: name,
    p_password: password,
    p_other_member_id: otherMemberId,
  });
  if (error) throw new Error(error.message);
  return ((data as DirectMessageRow[] | null) ?? []).map(toMessage);
}

/** Realtime Broadcast, not the durable record — sendDirectMessage() above already saved the
 *  message before this ever runs, so a dropped/missed broadcast just means the recipient sees it
 *  next time they open the chat instead of having their window pop immediately. One channel per
 *  member id (`dm-inbox-<id>`), same deterministic-name-as-mailbox pattern for both directions. */
let inboxChannel: RealtimeChannel | null = null;

/** Call after login/signup/session-restore success — opens (or re-registers the handler on) this
 *  member's own inbox channel so an incoming message can pop their chat window open. */
export function openChatInbox(memberId: number, onIncomingMessage: (fromId: number, fromName: string) => void): void {
  if (inboxChannel) {
    void inboxChannel.unsubscribe();
  }
  inboxChannel = supabase.channel(`dm-inbox-${memberId}`);
  inboxChannel.on("broadcast", { event: "new_message" }, ({ payload }) => {
    const fromId = payload?.from_id;
    const fromName = payload?.from_name;
    if (typeof fromId === "number" && typeof fromName === "string") onIncomingMessage(fromId, fromName);
  });
  inboxChannel.subscribe();
}

/** Call on logout/withdraw. */
export function closeChatInbox(): void {
  if (inboxChannel) void inboxChannel.unsubscribe();
  inboxChannel = null;
}

/** Nudges recipientId's inbox channel — a short-lived channel of its own (not reusing the
 *  recipient's inboxChannel, since only the recipient's own tab should hold that one open) that
 *  connects just long enough to send one broadcast, then disconnects. */
export function notifyNewMessage(recipientId: number, fromId: number, fromName: string): void {
  const notifyChannel = supabase.channel(`dm-inbox-${recipientId}`);
  notifyChannel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void notifyChannel.send({ type: "broadcast", event: "new_message", payload: { from_id: fromId, from_name: fromName } });
    setTimeout(() => void notifyChannel.unsubscribe(), 1000);
  });
}
