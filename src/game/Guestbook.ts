import { WrongAdminPasswordError } from "./Admin";
import { WrongMemberPasswordError } from "./Membership";
import { supabase } from "./supabaseClient";

export type GuestbookAttachmentType = "image" | "video";

export interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  /** Null for a top-level entry; the parent's id for a reply. Only one level deep. */
  parentId: number | null;
  /** Base64 data: URL of an optional photo/video attached at post time; replaceable via edit. */
  attachmentData: string | null;
  attachmentType: GuestbookAttachmentType | null;
  heartCount: number;
  /** Set when a logged-in BDJ member posted this — lets that same member edit/delete it without a
   *  password (see editGuestbookEntry/deleteGuestbookEntry's memberName/memberPassword params). */
  memberId: number | null;
  dateIso: string;
}

interface GuestbookRow {
  id: number;
  name: string;
  message: string;
  parent_id: number | null;
  attachment_data: string | null;
  attachment_type: GuestbookAttachmentType | null;
  heart_count: number;
  member_id: number | null;
  created_at: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong guestbook password");
  }
}

/** Thrown by edit/delete when the entry was posted with no password at all (see the schema's
 *  password_hash comment) — distinct from a wrong guess, since no password could ever match here. */
export class NoPasswordSetError extends Error {
  constructor() {
    super("This entry has no password set");
  }
}

/** Thrown by a member-authenticated edit/delete when the verified member doesn't own this entry —
 *  shouldn't normally surface (the client only offers password-less edit/delete for the logged-in
 *  member's own entries), but the server checks regardless. */
export class NotOwnerError extends Error {
  constructor() {
    super("You don't own this entry");
  }
}

/** Shared by editGuestbookEntry/deleteGuestbookEntry — both map the same set of RPC error codes to
 *  the same typed exceptions. */
function throwGuestbookError(error: { message: string }): never {
  if (error.message === "wrong_password") throw new WrongPasswordError();
  if (error.message === "no_password") throw new NoPasswordSetError();
  if (error.message === "wrong_member_password") throw new WrongMemberPasswordError();
  if (error.message === "not_owner") throw new NotOwnerError();
  throw new Error(error.message);
}

function toEntry(row: GuestbookRow): GuestbookEntry {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    parentId: row.parent_id,
    attachmentData: row.attachment_data,
    attachmentType: row.attachment_type,
    heartCount: row.heart_count,
    memberId: row.member_id,
    dateIso: row.created_at,
  };
}

/** Reads go straight to the `guestbook_public` view (see supabase/schema.sql) — it exposes every
 *  column except password_hash, so there's nothing sensitive for the anon key to leak here. */
export async function loadGuestbook(): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase
    .from("guestbook_public")
    .select("id, name, message, parent_id, attachment_data, attachment_type, heart_count, member_id, created_at")
    .order("id", { ascending: false });
  if (error || !data) return [];
  return data.map(toEntry);
}

export async function addGuestbookEntry(entry: {
  name: string;
  message: string;
  password: string;
  parentId?: number | null;
  attachmentData?: string | null;
  attachmentType?: GuestbookAttachmentType | null;
  /** When both are given, the entry is attributed to that logged-in member (with no password) —
   *  see add_guestbook_entry's member path in supabase/schema.sql. */
  memberName?: string | null;
  memberPassword?: string | null;
}): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("add_guestbook_entry", {
    p_name: entry.name,
    p_message: entry.message,
    p_password: entry.password,
    p_parent_id: entry.parentId ?? null,
    p_attachment_data: entry.attachmentData ?? null,
    p_attachment_type: entry.attachmentType ?? null,
    p_member_name: entry.memberName ?? null,
    p_member_password: entry.memberPassword ?? null,
  });
  if (error) {
    if (error.message === "wrong_member_password") throw new WrongMemberPasswordError();
    throw new Error(error.message);
  }
  if (!data) throw new Error("Failed to add guestbook entry");
  return (data as GuestbookRow[]).map(toEntry);
}

/** Password verification happens inside the Postgres function (submit the password, it never gets
 *  compared client-side), so a wrong password surfaces as the RPC raising `wrong_password`. Passing
 *  attachmentData replaces the existing attachment (if any); omitting it leaves it untouched.
 *  Passing memberName/memberPassword instead skips the password_hash check entirely — the RPC just
 *  verifies the member owns this entry (see edit_guestbook_entry's member path). */
export async function editGuestbookEntry(
  id: number,
  message: string,
  password?: string | null,
  attachmentData?: string | null,
  attachmentType?: GuestbookAttachmentType | null,
  memberName?: string | null,
  memberPassword?: string | null,
): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("edit_guestbook_entry", {
    p_id: id,
    p_message: message,
    p_password: password ?? null,
    p_attachment_data: attachmentData ?? null,
    p_attachment_type: attachmentType ?? null,
    p_member_name: memberName ?? null,
    p_member_password: memberPassword ?? null,
  });
  if (error) throwGuestbookError(error);
  return ((data as GuestbookRow[] | null) ?? []).map(toEntry);
}

/** No password required — anyone can heart any entry or reply, and toggle it back off. Abuse
 *  (repeat-clicking) is mitigated client-side only, via main.ts remembering hearted ids in
 *  localStorage. Both return just the new count, not the full guestbook — a heart click shouldn't
 *  pull down every other entry's (possibly multi-MB) attachment along with it. */
export async function addGuestbookHeart(id: number): Promise<number> {
  const { data, error } = await supabase.rpc("add_guestbook_heart", { p_id: id });
  if (error || data == null) throw new Error(error?.message ?? "Failed to add heart");
  return data as number;
}

export async function removeGuestbookHeart(id: number): Promise<number> {
  const { data, error } = await supabase.rpc("remove_guestbook_heart", { p_id: id });
  if (error || data == null) throw new Error(error?.message ?? "Failed to remove heart");
  return data as number;
}

export async function deleteGuestbookEntry(
  id: number,
  password?: string | null,
  memberName?: string | null,
  memberPassword?: string | null,
): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("delete_guestbook_entry", {
    p_id: id,
    p_password: password ?? null,
    p_member_name: memberName ?? null,
    p_member_password: memberPassword ?? null,
  });
  if (error) throwGuestbookError(error);
  return ((data as GuestbookRow[] | null) ?? []).map(toEntry);
}

/** Deleting a top-level entry cascades to its replies (see the table's on delete cascade) even if
 *  only the parent's id is in `ids` — the admin doesn't need to separately select its replies. */
export async function adminDeleteGuestbookEntries(ids: number[], adminPassword: string): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("admin_delete_guestbook_entries", { p_ids: ids, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as GuestbookRow[] | null) ?? []).map(toEntry);
}
