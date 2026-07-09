import { supabase } from "./supabaseClient";

export interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  dateIso: string;
}

interface GuestbookRow {
  id: number;
  name: string;
  message: string;
  created_at: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong guestbook password");
  }
}

function toEntry(row: GuestbookRow): GuestbookEntry {
  return { id: row.id, name: row.name, message: row.message, dateIso: row.created_at };
}

/** Reads go straight to the `guestbook_public` view (see supabase/schema.sql) — it exposes every
 *  column except password_hash, so there's nothing sensitive for the anon key to leak here. */
export async function loadGuestbook(): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.from("guestbook_public").select("id, name, message, created_at").order("id", { ascending: false });
  if (error || !data) return [];
  return data.map(toEntry);
}

export async function addGuestbookEntry(entry: { name: string; message: string; password: string }): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("add_guestbook_entry", {
    p_name: entry.name,
    p_message: entry.message,
    p_password: entry.password,
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
    throw new Error(error.message);
  }
  return ((data as GuestbookRow[] | null) ?? []).map(toEntry);
}

export async function deleteGuestbookEntry(id: number, password: string): Promise<GuestbookEntry[]> {
  const { data, error } = await supabase.rpc("delete_guestbook_entry", { p_id: id, p_password: password });
  if (error) {
    if (error.message === "wrong_password") throw new WrongPasswordError();
    throw new Error(error.message);
  }
  return ((data as GuestbookRow[] | null) ?? []).map(toEntry);
}
