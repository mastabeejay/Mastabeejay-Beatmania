import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

export interface BeejayBrosLink {
  id: number;
  url: string;
  text: string;
}

interface BeejayBrosLinkRow {
  id: number;
  url: string;
  text: string;
  sort_order: number;
  created_at: string;
}

function toLink(row: BeejayBrosLinkRow): BeejayBrosLink {
  return { id: row.id, url: row.url, text: row.text };
}

export class TooManyBeejayBrosLinksError extends Error {
  constructor() {
    super("Beejay Bros link limit reached");
  }
}

function throwBeejayBrosLinkError(error: { message: string }): never {
  if (error.message === "wrong_password") throw new WrongAdminPasswordError();
  if (error.message === "too_many_links") throw new TooManyBeejayBrosLinksError();
  throw new Error(error.message);
}

export async function loadBeejayBrosLinks(): Promise<BeejayBrosLink[]> {
  const { data, error } = await supabase
    .from("beejay_bros_links")
    .select("id, url, text, sort_order, created_at")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(toLink);
}

export async function adminAddBeejayBrosLink(url: string, text: string, adminPassword: string): Promise<BeejayBrosLink[]> {
  const { data, error } = await supabase.rpc("admin_add_beejay_bros_link", { p_url: url, p_text: text, p_admin_password: adminPassword });
  if (error) throwBeejayBrosLinkError(error);
  return ((data as BeejayBrosLinkRow[] | null) ?? []).map(toLink);
}

export async function adminUpdateBeejayBrosLink(id: number, url: string, text: string, adminPassword: string): Promise<BeejayBrosLink[]> {
  const { data, error } = await supabase.rpc("admin_update_beejay_bros_link", { p_id: id, p_url: url, p_text: text, p_admin_password: adminPassword });
  if (error) throwBeejayBrosLinkError(error);
  return ((data as BeejayBrosLinkRow[] | null) ?? []).map(toLink);
}

export async function adminDeleteBeejayBrosLink(id: number, adminPassword: string): Promise<BeejayBrosLink[]> {
  const { data, error } = await supabase.rpc("admin_delete_beejay_bros_link", { p_id: id, p_admin_password: adminPassword });
  if (error) throwBeejayBrosLinkError(error);
  return ((data as BeejayBrosLinkRow[] | null) ?? []).map(toLink);
}
