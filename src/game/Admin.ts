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

/** Still requires the current password, even from an already-logged-in session — see the RPC's own
 *  comment for why. Throws WrongAdminPasswordError if the current password doesn't match. */
export async function adminChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data, error } = await supabase.rpc("admin_change_password", {
    p_current_password: currentPassword,
    p_new_password: newPassword,
  });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  if (data !== true) throw new Error("Failed to change admin password");
}
