import { supabase } from "./supabaseClient";

export interface LeaderboardEntry {
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  bgm: string;
  dateIso: string;
}

export interface NewLeaderboardEntry {
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  bgm: string;
}

interface LeaderboardRow {
  name: string;
  message: string;
  score: number;
  speed: string;
  difficulty: string;
  bgm: string;
  created_at: string;
}

const MAX_ENTRIES = 10;

function toEntry(row: LeaderboardRow): LeaderboardEntry {
  return { name: row.name, message: row.message, score: row.score, speed: row.speed, difficulty: row.difficulty, bgm: row.bgm, dateIso: row.created_at };
}

/** Backed by Supabase Postgres (see supabase/schema.sql) rather than a server we host ourselves —
 *  records survive independently of any particular deploy or browser. */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("name, message, score, speed, difficulty, bgm, created_at")
    .order("score", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_ENTRIES);
  if (error || !data) return [];
  return data.map(toEntry);
}

/** Ties with the current 10th place don't bump it — only a strictly higher score earns a slot. */
export async function qualifiesForTop10(score: number): Promise<boolean> {
  const board = await loadLeaderboard();
  if (board.length < MAX_ENTRIES) return true;
  return score > board[board.length - 1].score;
}

export async function addLeaderboardEntry(entry: NewLeaderboardEntry): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("submit_score", {
    p_name: entry.name,
    p_message: entry.message,
    p_score: entry.score,
    p_speed: entry.speed,
    p_difficulty: entry.difficulty,
    p_bgm: entry.bgm,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to save leaderboard entry");
  return (data as LeaderboardRow[]).map(toEntry);
}
