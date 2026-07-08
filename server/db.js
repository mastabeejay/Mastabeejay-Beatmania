import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "leaderboard.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    score INTEGER NOT NULL,
    speed TEXT NOT NULL DEFAULT '-',
    difficulty TEXT NOT NULL DEFAULT '-',
    bgm TEXT NOT NULL DEFAULT '-',
    date_iso TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`INSERT OR IGNORE INTO visits (id, count) VALUES (1, 0)`);
db.exec(`
  CREATE TABLE IF NOT EXISTS guestbook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    date_iso TEXT NOT NULL
  )
`);

// Migrate databases created before speed/difficulty were tracked — existing rows backfill to '-'.
const leaderboardColumns = new Set(db.prepare(`PRAGMA table_info(leaderboard)`).all().map((col) => col.name));
if (!leaderboardColumns.has("speed")) {
  db.exec(`ALTER TABLE leaderboard ADD COLUMN speed TEXT NOT NULL DEFAULT '-'`);
}
if (!leaderboardColumns.has("difficulty")) {
  db.exec(`ALTER TABLE leaderboard ADD COLUMN difficulty TEXT NOT NULL DEFAULT '-'`);
}
if (!leaderboardColumns.has("bgm")) {
  db.exec(`ALTER TABLE leaderboard ADD COLUMN bgm TEXT NOT NULL DEFAULT '-'`);
}

const MAX_ENTRIES = 10;
const GUESTBOOK_LIMIT = 50; // keeps the guestbook bounded without needing pagination

const selectTopStmt = db.prepare(
  `SELECT name, message, score, speed, difficulty, bgm, date_iso as dateIso FROM leaderboard ORDER BY score DESC, id ASC LIMIT ?`,
);
const insertStmt = db.prepare(
  `INSERT INTO leaderboard (name, message, score, speed, difficulty, bgm, date_iso) VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const trimStmt = db.prepare(
  `DELETE FROM leaderboard WHERE id NOT IN (SELECT id FROM leaderboard ORDER BY score DESC, id ASC LIMIT ?)`,
);
const incrementVisitStmt = db.prepare(`UPDATE visits SET count = count + 1 WHERE id = 1`);
const getVisitCountStmt = db.prepare(`SELECT count FROM visits WHERE id = 1`);

const selectGuestbookStmt = db.prepare(`SELECT id, name, message, date_iso as dateIso FROM guestbook ORDER BY id DESC LIMIT ?`);
const insertGuestbookStmt = db.prepare(`INSERT INTO guestbook (name, message, password_hash, date_iso) VALUES (?, ?, ?, ?)`);
const getGuestbookPasswordHashStmt = db.prepare(`SELECT password_hash as passwordHash FROM guestbook WHERE id = ?`);
const updateGuestbookMessageStmt = db.prepare(`UPDATE guestbook SET message = ? WHERE id = ?`);
const deleteGuestbookStmt = db.prepare(`DELETE FROM guestbook WHERE id = ?`);
const trimGuestbookStmt = db.prepare(`DELETE FROM guestbook WHERE id NOT IN (SELECT id FROM guestbook ORDER BY id DESC LIMIT ?)`);

export function getTopEntries() {
  return selectTopStmt.all(MAX_ENTRIES);
}

/** The server stamps the date itself (not the client) so the leaderboard can't be skewed by a
 *  player's local clock. Trims back down to MAX_ENTRIES on every insert so the table never grows
 *  past what the leaderboard actually displays. */
export function insertEntry({ name, message, score, speed, difficulty, bgm }) {
  const dateIso = new Date().toISOString();
  insertStmt.run(name, message, score, speed, difficulty, bgm, dateIso);
  trimStmt.run(MAX_ENTRIES);
  return getTopEntries();
}

export function incrementVisitCount() {
  incrementVisitStmt.run();
  return getVisitCountStmt.get().count;
}

/** scrypt with a per-entry random salt — never store the raw password. Format is "salt:hash" so
 *  verification doesn't need a separate column. */
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function getGuestbookEntries() {
  return selectGuestbookStmt.all(GUESTBOOK_LIMIT);
}

export function addGuestbookEntry({ name, message, password }) {
  const dateIso = new Date().toISOString();
  insertGuestbookStmt.run(name, message, hashPassword(password), dateIso);
  trimGuestbookStmt.run(GUESTBOOK_LIMIT);
  return getGuestbookEntries();
}

/** Returns "not_found" | "wrong_password" | the refreshed entry list on success — callers map
 *  the string outcomes to the appropriate HTTP status. */
export function editGuestbookEntry(id, message, password) {
  const row = getGuestbookPasswordHashStmt.get(id);
  if (!row) return "not_found";
  if (!verifyPassword(password, row.passwordHash)) return "wrong_password";
  updateGuestbookMessageStmt.run(message, id);
  return getGuestbookEntries();
}

export function deleteGuestbookEntry(id, password) {
  const row = getGuestbookPasswordHashStmt.get(id);
  if (!row) return "not_found";
  if (!verifyPassword(password, row.passwordHash)) return "wrong_password";
  deleteGuestbookStmt.run(id);
  return getGuestbookEntries();
}
