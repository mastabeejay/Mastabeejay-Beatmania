import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

/** The admin's site-wide skin choice from the [Skin design set] panel section: "original" is the
 *  launch cyberpunk look, "ai" is the neutral-dark/emerald reskin modeled on the v0 "Pointer AI
 *  landing page" template, "frosted" is the Apple-style glassmorphism reskin modeled on the v0
 *  "Frosted Glass - Authentication Concept" template. Applied as an html.theme-* class — see
 *  applySkinDesign() in main.ts. */
export type SkinDesign = "original" | "ai" | "frosted";

export const SKIN_DESIGNS: SkinDesign[] = ["original", "ai", "frosted"];

/** Same degrade-to-default shape as loadChatbotMode: if the skin_design column doesn't exist yet
 *  (SQL migration not run) or the read fails, the site just stays on the original skin instead of
 *  erroring anything visible. */
export async function loadSkinDesign(): Promise<SkinDesign> {
  const { data, error } = await supabase.from("site_notice").select("skin_design").eq("id", 1).maybeSingle();
  if (error || !SKIN_DESIGNS.includes(data?.skin_design as SkinDesign)) return "original";
  return data!.skin_design as SkinDesign;
}

export async function adminSetSkinDesign(skin: SkinDesign, adminPassword: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_skin_design", { p_skin: skin, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
}
