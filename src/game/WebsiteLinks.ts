import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export type WebsiteLinkFontFamily = "body" | "display" | "graffiti";
export type WebsiteLinkAnimation = "none" | "pulse" | "bounce" | "fade" | "glow";

export interface WebsiteLink {
  id: number;
  url: string;
  message: string;
  fontSize: number;
  fontColor: string;
  fontFamily: WebsiteLinkFontFamily;
  borderColor: string;
  animation: WebsiteLinkAnimation;
}

interface WebsiteLinkRow {
  id: number;
  url: string;
  message: string;
  font_size: number;
  font_color: string;
  font_family: WebsiteLinkFontFamily;
  border_color: string;
  animation: WebsiteLinkAnimation;
  sort_order: number;
  created_at: string;
}

function toLink(row: WebsiteLinkRow): WebsiteLink {
  return {
    id: row.id,
    url: row.url,
    message: row.message,
    fontSize: row.font_size,
    fontColor: row.font_color,
    fontFamily: row.font_family,
    borderColor: row.border_color,
    animation: row.animation,
  };
}

export interface WebsiteLinkParams {
  url: string;
  message: string;
  fontSize: number;
  fontColor: string;
  fontFamily: WebsiteLinkFontFamily;
  borderColor: string;
  animation: WebsiteLinkAnimation;
}

export class TooManyWebsiteLinksError extends Error {
  constructor() {
    super("Website link limit reached");
  }
}

function throwWebsiteLinkError(error: { message: string }): never {
  if (error.message === "wrong_password") throw new WrongAdminPasswordError();
  if (error.message === "too_many_links") throw new TooManyWebsiteLinksError();
  throw new Error(error.message);
}

export async function loadWebsiteLinks(): Promise<WebsiteLink[]> {
  const { data, error } = await supabase
    .from("website_links")
    .select("id, url, message, font_size, font_color, font_family, border_color, animation, sort_order, created_at")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(toLink);
}

export async function adminAddWebsiteLink(params: WebsiteLinkParams, adminPassword: string): Promise<WebsiteLink[]> {
  const { data, error } = await supabase.rpc("admin_add_website_link", {
    p_url: params.url,
    p_message: params.message,
    p_font_size: params.fontSize,
    p_font_color: params.fontColor,
    p_font_family: params.fontFamily,
    p_border_color: params.borderColor,
    p_animation: params.animation,
    p_admin_password: adminPassword,
  });
  if (error) throwWebsiteLinkError(error);
  return ((data as WebsiteLinkRow[] | null) ?? []).map(toLink);
}

export async function adminUpdateWebsiteLink(id: number, params: WebsiteLinkParams, adminPassword: string): Promise<WebsiteLink[]> {
  const { data, error } = await supabase.rpc("admin_update_website_link", {
    p_id: id,
    p_url: params.url,
    p_message: params.message,
    p_font_size: params.fontSize,
    p_font_color: params.fontColor,
    p_font_family: params.fontFamily,
    p_border_color: params.borderColor,
    p_animation: params.animation,
    p_admin_password: adminPassword,
  });
  if (error) throwWebsiteLinkError(error);
  return ((data as WebsiteLinkRow[] | null) ?? []).map(toLink);
}

export async function adminDeleteWebsiteLink(id: number, adminPassword: string): Promise<WebsiteLink[]> {
  const { data, error } = await supabase.rpc("admin_delete_website_link", { p_id: id, p_admin_password: adminPassword });
  if (error) throwWebsiteLinkError(error);
  return ((data as WebsiteLinkRow[] | null) ?? []).map(toLink);
}
