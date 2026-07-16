import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export interface SocialLink {
  id: number;
  platform: string;
  url: string;
  /** Optional admin-uploaded image (data: URL) shown instead of the platform's SVG icon when set. */
  imageData: string | null;
}

interface SocialLinkRow {
  id: number;
  platform: string;
  url: string;
  image_data: string | null;
  created_at: string;
}

function toLink(row: SocialLinkRow): SocialLink {
  return { id: row.id, platform: row.platform, url: row.url, imageData: row.image_data };
}

export async function loadSocialLinks(): Promise<SocialLink[]> {
  const { data, error } = await supabase.from("social_links").select("id, platform, url, image_data, created_at").order("id", { ascending: true });
  if (error || !data) return [];
  return data.map(toLink);
}

export async function adminAddSocialLink(platform: string, url: string, adminPassword: string, imageData?: string | null): Promise<SocialLink[]> {
  const { data, error } = await supabase.rpc("admin_add_social_link", {
    p_platform: platform,
    p_url: url,
    p_admin_password: adminPassword,
    p_image_data: imageData ?? null,
  });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as SocialLinkRow[] | null) ?? []).map(toLink);
}

/** imageData left undefined/null keeps the link's existing image (or lack of one) unchanged. */
export async function adminUpdateSocialLink(id: number, platform: string, url: string, adminPassword: string, imageData?: string | null): Promise<SocialLink[]> {
  const { data, error } = await supabase.rpc("admin_update_social_link", {
    p_id: id,
    p_platform: platform,
    p_url: url,
    p_admin_password: adminPassword,
    p_image_data: imageData ?? null,
  });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as SocialLinkRow[] | null) ?? []).map(toLink);
}

export async function adminDeleteSocialLink(id: number, adminPassword: string): Promise<SocialLink[]> {
  const { data, error } = await supabase.rpc("admin_delete_social_link", { p_id: id, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as SocialLinkRow[] | null) ?? []).map(toLink);
}
