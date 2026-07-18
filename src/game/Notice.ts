import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export type BannerMode = "none" | "notice" | "graffiti" | "images";

export interface SiteBanner {
  message: string | null;
  graffitiText: string | null;
  /** AI-generated graffiti artwork (data: URL) from the [배너: 그래피티] AI-generate button — see
   *  GraffitiImage.ts. Null whenever the admin last saved through the plain banner form instead. */
  graffitiImageData: string | null;
  displayMode: BannerMode;
}

interface SiteBannerRow {
  message: string | null;
  graffiti_text: string | null;
  graffiti_image_data: string | null;
  display_mode: BannerMode;
}

const EMPTY_BANNER: SiteBanner = { message: null, graffitiText: null, graffitiImageData: null, displayMode: "none" };

function toBanner(row: SiteBannerRow): SiteBanner {
  return { message: row.message, graffitiText: row.graffiti_text, graffitiImageData: row.graffiti_image_data, displayMode: row.display_mode };
}

export async function loadBanner(): Promise<SiteBanner> {
  const { data, error } = await supabase.from("site_notice").select("message, graffiti_text, graffiti_image_data, display_mode").eq("id", 1).maybeSingle();
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

/** Saves an AI-generated graffiti image (see GraffitiImage.ts) alongside its source text, and
 *  switches display_mode to 'graffiti' — the AI-graffiti counterpart to adminSetBanner, called from
 *  its own "AI 그래피티 생성" button rather than the regular 저장 button. */
export async function adminSetGraffitiImage(graffitiText: string, imageDataUrl: string, adminPassword: string): Promise<SiteBanner> {
  const { data, error } = await supabase.rpc("admin_set_graffiti_image", {
    p_graffiti_text: graffitiText,
    p_image_data: imageDataUrl,
    p_admin_password: adminPassword,
  });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  const row = (data as SiteBannerRow[] | null)?.[0];
  return row ? toBanner(row) : EMPTY_BANNER;
}
