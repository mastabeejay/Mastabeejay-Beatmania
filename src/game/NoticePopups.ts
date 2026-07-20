import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

/** One admin-authored popup notice — see notice_popups in supabase/schema.sql. Distinct from the
 *  site_notice singleton inline banner: up to 3 of these can exist independently, each with its own
 *  enabled toggle, and they're shown together in a dismissible modal on main-screen load rather
 *  than inline on the page. */
export interface NoticePopupItem {
  id: number;
  content: string;
  enabled: boolean;
  sortOrder: number;
}

interface NoticePopupRow {
  id: number;
  content: string;
  enabled: boolean;
  sort_order: number;
}

function toItem(row: NoticePopupRow): NoticePopupItem {
  return { id: row.id, content: row.content, enabled: row.enabled, sortOrder: row.sort_order };
}

export class TooManyNoticePopupsError extends Error {
  constructor() {
    super("Notice popup limit reached");
  }
}

function throwNoticePopupError(error: { message: string }): never {
  if (error.message === "wrong_password") throw new WrongAdminPasswordError();
  if (error.message === "too_many_notices") throw new TooManyNoticePopupsError();
  throw new Error(error.message);
}

/** Returns every notice regardless of enabled state — RLS allows this same as every other
 *  admin-managed list in this codebase. The main-screen popup filters to enabled ones itself; the
 *  admin panel needs the disabled ones too so they can be edited/re-enabled without re-typing them. */
export async function loadNoticePopups(): Promise<NoticePopupItem[]> {
  const { data, error } = await supabase.from("notice_popups").select("id, content, enabled, sort_order").order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as NoticePopupRow[]).map(toItem);
}

export async function adminAddNoticePopup(content: string, adminPassword: string): Promise<NoticePopupItem[]> {
  const { data, error } = await supabase.rpc("admin_add_notice_popup", { p_content: content, p_admin_password: adminPassword });
  if (error) throwNoticePopupError(error);
  return ((data as NoticePopupRow[] | null) ?? []).map(toItem);
}

export async function adminUpdateNoticePopup(id: number, content: string, enabled: boolean, adminPassword: string): Promise<NoticePopupItem[]> {
  const { data, error } = await supabase.rpc("admin_update_notice_popup", {
    p_id: id,
    p_content: content,
    p_enabled: enabled,
    p_admin_password: adminPassword,
  });
  if (error) throwNoticePopupError(error);
  return ((data as NoticePopupRow[] | null) ?? []).map(toItem);
}

export async function adminDeleteNoticePopup(id: number, adminPassword: string): Promise<NoticePopupItem[]> {
  const { data, error } = await supabase.rpc("admin_delete_notice_popup", { p_id: id, p_admin_password: adminPassword });
  if (error) throwNoticePopupError(error);
  return ((data as NoticePopupRow[] | null) ?? []).map(toItem);
}
