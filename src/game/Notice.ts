import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export async function loadNotice(): Promise<string | null> {
  const { data, error } = await supabase.from("site_notice").select("message").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return data.message;
}

export async function adminSetNotice(message: string, adminPassword: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("admin_set_notice", { p_message: message, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return data as string | null;
}
