import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export type WebsiteLinkFontFamily = "body" | "display" | "graffiti";
export type WebsiteLinkAnimation = "none" | "pulse" | "bounce" | "fade" | "glow";

export interface WebsiteLink {
  id: number;
  url: string;
  title: string;
  titleFontSize: number;
  titleFontFamily: WebsiteLinkFontFamily;
  titleBold: boolean;
  content: string;
  contentFontSize: number;
  contentFontFamily: WebsiteLinkFontFamily;
  contentBold: boolean;
  fontColor: string;
  borderColor: string;
  animation: WebsiteLinkAnimation;
}

interface WebsiteLinkRow {
  id: number;
  url: string;
  title: string;
  title_font_size: number;
  title_font_family: WebsiteLinkFontFamily;
  title_bold: boolean;
  content: string;
  content_font_size: number;
  content_font_family: WebsiteLinkFontFamily;
  content_bold: boolean;
  font_color: string;
  border_color: string;
  animation: WebsiteLinkAnimation;
  sort_order: number;
  created_at: string;
}

function toLink(row: WebsiteLinkRow): WebsiteLink {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    titleFontSize: row.title_font_size,
    titleFontFamily: row.title_font_family,
    titleBold: row.title_bold,
    content: row.content,
    contentFontSize: row.content_font_size,
    contentFontFamily: row.content_font_family,
    contentBold: row.content_bold,
    fontColor: row.font_color,
    borderColor: row.border_color,
    animation: row.animation,
  };
}

export interface WebsiteLinkParams {
  url: string;
  title: string;
  titleFontSize: number;
  titleFontFamily: WebsiteLinkFontFamily;
  titleBold: boolean;
  content: string;
  contentFontSize: number;
  contentFontFamily: WebsiteLinkFontFamily;
  contentBold: boolean;
  fontColor: string;
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
    .select(
      "id, url, title, title_font_size, title_font_family, title_bold, content, content_font_size, content_font_family, content_bold, font_color, border_color, animation, sort_order, created_at",
    )
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(toLink);
}

function toRpcParams(params: WebsiteLinkParams) {
  return {
    p_url: params.url,
    p_title: params.title,
    p_title_font_size: params.titleFontSize,
    p_title_font_family: params.titleFontFamily,
    p_title_bold: params.titleBold,
    p_content: params.content,
    p_content_font_size: params.contentFontSize,
    p_content_font_family: params.contentFontFamily,
    p_content_bold: params.contentBold,
    p_font_color: params.fontColor,
    p_border_color: params.borderColor,
    p_animation: params.animation,
  };
}

export async function adminAddWebsiteLink(params: WebsiteLinkParams, adminPassword: string): Promise<WebsiteLink[]> {
  const { data, error } = await supabase.rpc("admin_add_website_link", { ...toRpcParams(params), p_admin_password: adminPassword });
  if (error) throwWebsiteLinkError(error);
  return ((data as WebsiteLinkRow[] | null) ?? []).map(toLink);
}

export async function adminUpdateWebsiteLink(id: number, params: WebsiteLinkParams, adminPassword: string): Promise<WebsiteLink[]> {
  const { data, error } = await supabase.rpc("admin_update_website_link", { p_id: id, ...toRpcParams(params), p_admin_password: adminPassword });
  if (error) throwWebsiteLinkError(error);
  return ((data as WebsiteLinkRow[] | null) ?? []).map(toLink);
}

export async function adminDeleteWebsiteLink(id: number, adminPassword: string): Promise<WebsiteLink[]> {
  const { data, error } = await supabase.rpc("admin_delete_website_link", { p_id: id, p_admin_password: adminPassword });
  if (error) throwWebsiteLinkError(error);
  return ((data as WebsiteLinkRow[] | null) ?? []).map(toLink);
}
