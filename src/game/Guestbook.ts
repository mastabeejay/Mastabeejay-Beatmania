import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  /** Null for a top-level entry; the parent's id for a reply. Only one level deep. */
  parentId: number | null;
  dateIso: string;
}

interface GuestbookRow {
  id: number;
  name: string;
  message: string;
  parent_id: number | null;
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

function toEntry(row: GuestbookRow): GuestbookEntry {
  return { id: row.id, name: row.name, message: row.message, parentId: row.parent_id, dateIso: row.created_at };
}

/** Reads go straight to the `guestbook_public` view (see supabase/schema.sql) — it exposes every
 *  column except password_hash, so there's nothing sensitive for the anon key to leak here. */
export async function loadGuestbook(): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase
    .from("guestbook_public")
    .select("id, name, message, parent_id, created_at")
    .order("id", { ascending: false });
  if (error || !data) return [];
  return data.map(toEntry);
}

export async function addGuestbookEntry(entry: {
  name: string;
  message: string;
  password: string;
  parentId?: number | null;
}): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("add_guestbook_entry", {
    p_name: entry.name,
    p_message: entry.message,
    p_password: entry.password,
    p_parent_id: entry.parentId ?? null,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to add guestbook entry");
  return (data as GuestbookRow[]).map(toEntry);
}

/** Password verification happens inside the Postgres function (submit the password, it never gets
 *  compared client-side), so a wrong password surfaces as the RPC raising `wrong_password`. */
export async function editGuestbookEntry(id: number, message: string, password: string): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("edit_guestbook_entry", { p_id: id, p_message: message, p_password: password });
  if (error) {
    if (error.message === "wrong_password") throw new WrongPasswordError();
    if (error.message === "no_password") throw new NoPasswordSetError();
    throw new Error(error.message);
  }
  return ((data as GuestbookRow[] | null) ?? []).map(toEntry);
}

export async function deleteGuestbookEntry(id: number, password: string): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("delete_guestbook_entry", { p_id: id, p_password: password });
  if (error) {
    if (error.message === "wrong_password") throw new WrongPasswordError();
    if (error.message === "no_password") throw new NoPasswordSetError();
    throw new Error(error.message);
  }
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
