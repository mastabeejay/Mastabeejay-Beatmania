import { supabase } from "./supabaseClient";

/** Thrown by admin-gated actions when the stored/entered admin password doesn't match what's
 *  hashed in Supabase's admin_settings table (see supabase/schema.sql). */
export class WrongAdminPasswordError extends Error {
  constructor() {
    super("Wrong admin password");
  }
}

/** No session/token — every admin action re-sends the password and the server re-verifies it via
 *  admin_login(), exactly like the guestbook's own per-entry password checks. This call is only
 *  used to validate a password before switching the UI into admin mode. */
export async function adminLogin(password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_login", { p_password: password });
  if (error) return false;
  return data === true;
}
