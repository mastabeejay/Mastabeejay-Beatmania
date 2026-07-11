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

/** Appends to the existing set (capped at 4 total server-side) and switches display_mode to
 *  "images" — see admin_add_banner_images in supabase/schema.sql. */
export async function adminAddBannerImages(images: string[], adminPassword: string): Promise<BannerImage[]> {
  const { data, error } = await supabase.rpc("admin_add_banner_images", { p_images: images, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as BannerImageRow[] | null) ?? []).map(toImage);
}

export async function adminDeleteBannerImage(id: number, adminPassword: string): Promise<BannerImage[]> {
  const { data, error } = await supabase.rpc("admin_delete_banner_image", { p_id: id, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as BannerImageRow[] | null) ?? []).map(toImage);
}
