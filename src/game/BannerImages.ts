import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export interface BannerImage {
  id: number;
  imageData: string;
  sortOrder: number;
}

interface BannerImageRow {
  id: number;
  image_data: string;
  sort_order: number;
}

function toImage(row: BannerImageRow): BannerImage {
  return { id: row.id, imageData: row.image_data, sortOrder: row.sort_order };
}

export async function loadBannerImages(): Promise<BannerImage[]> {
  const { data, error } = await supabase
    .from("site_banner_images")
    .select("id, image_data, sort_order")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(toImage);
}

/** Replaces the whole set (1-4 images) in one call and switches display_mode to "images" server-side
 *  — see admin_set_banner_images in supabase/schema.sql. */
export async function adminSetBannerImages(images: string[], adminPassword: string): Promise<BannerImage[]> {
  const { data, error } = await supabase.rpc("admin_set_banner_images", { p_images: images, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as BannerImageRow[] | null) ?? []).map(toImage);
}
