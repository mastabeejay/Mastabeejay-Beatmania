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

const API_BASE = "/api/leaderboard";
const MAX_ENTRIES = 10;

/** Backed by a real SQLite database on the server (server/db.js) rather than localStorage, so
 *  records survive browser data clears and are shared across whatever browser/PC hits this server. */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

/** Ties with the current 10th place don't bump it — only a strictly higher score earns a slot. */
export async function qualifiesForTop10(score: number): Promise<boolean> {
  const board = await loadLeaderboard();
  if (board.length < MAX_ENTRIES) return true;
  return score > board[board.length - 1].score;
}

export async function addLeaderboardEntry(entry: NewLeaderboardEntry): Promise<LeaderboardEntry[]> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Failed to save leaderboard entry (${res.status})`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as LeaderboardEntry[]) : [];
}
