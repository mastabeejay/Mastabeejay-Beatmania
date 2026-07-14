import { WrongAdminPasswordError } from "./Admin";
import { WrongMemberPasswordError } from "./Membership";
import { supabase } from "./supabaseClient";

export interface LeaderboardEntry {
  id: number;
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  /** How many escalation steps the run reached — 1 for a single-step run (including every row
   *  recorded before the multi-step feature existed, via the column's DB default). */
  step: number;
  bgm: string;
  /** Base64 data URL of the top-10 celebration photo — null for older rows migrated before this
   *  existed, or if the player's camera wasn't available at capture time. */
  photo: string | null;
  /** Set when a logged-in BDJ member submitted this — lets that same member edit the message or
   *  delete the entry without a password (see editLeaderboardEntry/deleteLeaderboardEntry). The
   *  score itself is never editable, by anyone. */
  memberId: number | null;
  dateIso: string;
}

export interface NewLeaderboardEntry {
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  step: number;
  bgm: string;
  photo: string | null;
  /** When both are given, the entry is attributed to that logged-in member (with no "(Guest)"
   *  suffix) — see submit_score's member path in supabase/schema.sql. */
  memberName?: string | null;
  memberPassword?: string | null;
}

interface LeaderboardRow {
  id: number;
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  step: number;
  bgm: string;
  photo: string | null;
  member_id: number | null;
  created_at: string;
}

const MAX_ENTRIES = 20;

function toEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    score: row.score,
    speed: row.speed,
    difficulty: row.difficulty,
    step: row.step,
    bgm: row.bgm,
    photo: row.photo,
    memberId: row.member_id,
    dateIso: row.created_at,
  };
}

/** Backed by Supabase Postgres (see supabase/schema.sql) rather than a server we host ourselves —
 *  records survive independently of any particular deploy or browser. */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("id, name, message, score, speed, difficulty, step, bgm, photo, member_id, created_at")
    .order("score", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_ENTRIES);
  if (error || !data) return [];
  return data.map(toEntry);
}

/** Ties with the current 20th place don't bump it — only a strictly higher score earns a slot.
 *  A score of 0 never qualifies, even on an empty board — there's nothing to celebrate. */
export async function qualifiesForTop20(score: number): Promise<boolean> {
  if (score <= 0) return false;
  const board = await loadLeaderboard();
  if (board.length < MAX_ENTRIES) return true;
  return score > board[board.length - 1].score;
}

/** Where this score would land if submitted right now — 1-indexed, counting how many current
 *  entries outscore it. Used to announce "N위 입성" before the photo countdown. */
export async function computeProjectedRank(score: number): Promise<number> {
  const board = await loadLeaderboard();
  return board.filter((entry) => entry.score > score).length + 1;
}

export async function addLeaderboardEntry(entry: NewLeaderboardEntry): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("submit_score", {
    p_name: entry.name,
    p_message: entry.message,
    p_score: entry.score,
    p_speed: entry.speed,
    p_difficulty: entry.difficulty,
    p_step: entry.step,
    p_bgm: entry.bgm,
    p_photo: entry.photo,
    p_member_name: entry.memberName ?? null,
    p_member_password: entry.memberPassword ?? null,
  });
  if (error) {
    if (error.message === "wrong_member_password") throw new WrongMemberPasswordError();
    throw new Error(error.message);
  }
  if (!data) throw new Error("Failed to save leaderboard entry");
  return (data as LeaderboardRow[]).map(toEntry);
}

/** Bypasses the normal per-row rules entirely (there is no per-row password for leaderboard rows
 *  to begin with) — gated purely by the shared admin password, re-verified server-side every call. */
export async function adminDeleteLeaderboardEntries(ids: number[], adminPassword: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("admin_delete_leaderboard_entries", { p_ids: ids, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
  return ((data as LeaderboardRow[] | null) ?? []).map(toEntry);
}
