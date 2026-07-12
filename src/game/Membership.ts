import { supabase } from "./supabaseClient";

export interface Member {
  id: number;
  name: string;
  photoData: string | null;
}

interface MemberRow {
  id: number;
  name: string;
  photo_data: string | null;
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
  return { id: row.id, name: row.name, photoData: row.photo_data };
}

export interface MemberSignupParams {
  name: string;
  password: string;
  photoData?: string | null;
  gender?: "male" | "female" | null;
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
    p_gender: params.gender ?? null,
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
