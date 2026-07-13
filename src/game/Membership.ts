import { supabase } from "./supabaseClient";

export type MemberGender = "male" | "female";

export interface Member {
  id: number;
  name: string;
  photoData: string | null;
  gender: MemberGender | null;
  /** 'YYYY-MM-DD' */
  birthdate: string | null;
  phone: string | null;
  email: string | null;
}

interface MemberRow {
  id: number;
  name: string;
  photo_data: string | null;
  gender: MemberGender | null;
  birthdate: string | null;
  phone: string | null;
  email: string | null;
}

/** One row of the public "BDJ Members" directory (see members_public in supabase/schema.sql) —
 *  deliberately narrower than Member: no birthdate/phone/email, nothing not meant for anyone to see. */
export interface MemberDirectoryEntry {
  id: number;
  name: string;
  gender: MemberGender | null;
  photoData: string | null;
  dateIso: string;
}

interface MemberDirectoryRow {
  id: number;
  name: string;
  gender: MemberGender | null;
  photo_data: string | null;
  created_at: string;
}

/** Thrown when a login (or a member-owned write elsewhere) doesn't match the bcrypt hash stored in
 *  Supabase's members table (see supabase/schema.sql's verify_member()). */
export class WrongMemberPasswordError extends Error {
  constructor() {
    super("Wrong member password");
  }
}

/** `name` doubles as the login handle (no separate username), so signup rejects one already in use. */
export class NameTakenError extends Error {
  constructor() {
    super("Member name already taken");
  }
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    photoData: row.photo_data,
    gender: row.gender,
    birthdate: row.birthdate,
    phone: row.phone,
    email: row.email,
  };
}

export interface MemberSignupParams {
  name: string;
  password: string;
  photoData?: string | null;
  gender: MemberGender;
  /** 'YYYY-MM-DD' */
  birthdate?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** No session/token — same stateless pattern as admin login (see Admin.ts): the client caches
 *  {name, password} (in localStorage, so — unlike the admin's sessionStorage — it survives a
 *  browser restart) and resends the password on every member-owned write, re-verified
 *  server-side via verify_member() every time. */
export async function memberSignup(params: MemberSignupParams): Promise<Member> {
  const { data, error } = await supabase.rpc("member_signup", {
    p_name: params.name,
    p_password: params.password,
    p_photo_data: params.photoData ?? null,
    p_gender: params.gender,
    p_birthdate: params.birthdate ?? null,
    p_phone: params.phone ?? null,
    p_email: params.email ?? null,
  });
  if (error) {
    if (error.message === "name_taken") throw new NameTakenError();
    throw new Error(error.message);
  }
  const row = (data as MemberRow[] | null)?.[0];
  if (!row) throw new Error("Failed to sign up");
  return toMember(row);
}

export async function memberLogin(name: string, password: string): Promise<Member> {
  const { data, error } = await supabase.rpc("member_login", { p_name: name, p_password: password });
  if (error) {
    if (error.message === "wrong_member_password") throw new WrongMemberPasswordError();
    throw new Error(error.message);
  }
  const row = (data as MemberRow[] | null)?.[0];
  if (!row) throw new Error("Failed to log in");
  return toMember(row);
}

export interface MemberProfileUpdateParams {
  gender: MemberGender;
  birthdate?: string | null;
  phone?: string | null;
  email?: string | null;
  /** A newly-picked photo to replace the existing one; omit/null to leave the current photo alone. */
  photoData?: string | null;
}

/** Re-verifies the password fresh (typed into the profile modal, not silently reused from the
 *  cached login credentials) — same "current password required to change something sensitive"
 *  caution as admin_change_password. */
export async function updateMemberProfile(name: string, password: string, params: MemberProfileUpdateParams): Promise<Member> {
  const { data, error } = await supabase.rpc("member_update_profile", {
    p_name: name,
    p_password: password,
    p_gender: params.gender,
    p_birthdate: params.birthdate ?? null,
    p_phone: params.phone ?? null,
    p_email: params.email ?? null,
    p_new_photo_data: params.photoData ?? null,
  });
  if (error) {
    if (error.message === "wrong_member_password") throw new WrongMemberPasswordError();
    throw new Error(error.message);
  }
  const row = (data as MemberRow[] | null)?.[0];
  if (!row) throw new Error("Failed to update profile");
  return toMember(row);
}

/** Public read, no login required — same view-backed pattern as loadGuestbook/loadLeaderboard,
 *  except this THROWS on error instead of returning [] — the directory popup needs to tell "no
 *  members yet" apart from "the members_public view doesn't exist / couldn't be reached", since
 *  an empty-looking directory with registered members hides a real problem. */
export async function loadMembers(): Promise<MemberDirectoryEntry[]> {
  const { data, error } = await supabase
    .from("members_public")
    .select("id, name, gender, photo_data, created_at")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as MemberDirectoryRow[] | null) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    gender: row.gender,
    photoData: row.photo_data,
    dateIso: row.created_at,
  }));
}
