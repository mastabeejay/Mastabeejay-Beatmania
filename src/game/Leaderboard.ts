import { supabase } from "./supabaseClient";

export interface LeaderboardEntry {
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
}

interface LeaderboardRow {
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  step: number;
  bgm: string;
  photo: string | null;
  created_at: string;
}

const MAX_ENTRIES = 20;

function toEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    name: row.name,
    message: row.message,
    score: row.score,
    speed: row.speed,
    difficulty: row.difficulty,
    step: row.step,
    bgm: row.bgm,
    photo: row.photo,
    dateIso: row.created_at,
  };
}

/** Backed by Supabase Postgres (see supabase/schema.sql) rather than a server we host ourselves —
 *  records survive independently of any particular deploy or browser. */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("name, message, score, speed, difficulty, step, bgm, photo, created_at")
    .order("score", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_ENTRIES);
  if (error || !data) return [];
  return data.map(toEntry);
}

/** Ties with the current 20th place don't bump it — only a strictly higher score earns a slot. */
export async function qualifiesForTop20(score: number): Promise<boolean> {
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
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to save leaderboard entry");
  return (data as LeaderboardRow[]).map(toEntry);
}
