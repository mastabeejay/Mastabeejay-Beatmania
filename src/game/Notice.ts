import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export type BannerMode = "none" | "notice" | "graffiti";

export interface SiteBanner {
  message: string | null;
  graffitiText: string | null;
  displayMode: BannerMode;
}

interface SiteBannerRow {
  message: string | null;
  graffiti_text: string | null;
  display_mode: BannerMode;
}

const EMPTY_BANNER: SiteBanner = { message: null, graffitiText: null, displayMode: "none" };

function toBanner(row: SiteBannerRow): SiteBanner {
  return { message: row.message, graffitiText: row.graffiti_text, displayMode: row.display_mode };
}

export async function loadBanner(): Promise<SiteBanner> {
  const { data, error } = await supabase.from("site_notice").select("message, graffiti_text, display_mode").eq("id", 1).maybeSingle();
  if (error || !data) return EMPTY_BANNER;
  return toBanner(data);
}

export async function adminSetBanner(noticeText: string, graffitiText: string, displayMode: BannerMode, adminPassword: string): Promise<SiteBanner> {
  const { data, error } = await supabase.rpc("admin_set_banner", {
    p_notice_text: noticeText,
    p_graffiti_text: graffitiText,
    p_display_mode: displayMode,
    p_admin_password: adminPassword,
  });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  const row = (data as SiteBannerRow[] | null)?.[0];
  return row ? toBanner(row) : EMPTY_BANNER;
}
