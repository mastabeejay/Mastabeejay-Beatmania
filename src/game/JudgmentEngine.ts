import type { NoteEvent } from "./types";

export type JudgmentTier = "Excellent" | "Great" | "Good" | "Bad";

export interface JudgmentResult {
  tier: JudgmentTier;
  lane: number;
}

const EXCELLENT_WINDOW_MS = 50;
const GREAT_WINDOW_MS = 100;
const GOOD_WINDOW_MS = 220;
const BAD_WINDOW_MS = 400; // outer bound: a press further off than this from any note is ignored, not judged

export class JudgmentEngine {
  /** Must be sorted ascending by timeMs — every method below relies on that to bound its scan to
   *  notes near the current song time instead of walking the entire chart every call. */
  private notes: NoteEvent[];
  private judgedIds: Set<string>;
  private holdWasActive: Set<string>;
  /** Index of the first note that MIGHT still be relevant to some future call. Every note before
   *  this index is guaranteed fully resolved (judged or permanently expired) and is never looked at
   *  again — advanced monotonically in step with songTimeMs, which itself only ever increases. */
  private cursor: number;

  constructor(notes: NoteEvent[]) {
    this.notes = notes;
    this.judgedIds = new Set();
    this.holdWasActive = new Set();
    this.cursor = 0;
  }

  /** A chart can run to several thousand notes over a full song; without this, every one of the four
   *  sweep/judge calls below re-scanned the WHOLE chart every frame (or every hand-tracking tick, for
   *  markHoldActive) forever, including notes judged minutes ago — cost grew with total song length,
   *  not with how much is actually happening "now". Only ever skips a note once it's CONFIRMED fully
   *  resolved (present in judgedIds) — never based on a time cutoff alone, which would risk advancing
   *  past a note before sweepMisses/sweepHoldNotes ever got a chance to actually judge it as missed,
   *  silently dropping it from scoring entirely. Every note ends up in judgedIds within one BAD_WINDOW_MS
   *  (~400ms) of its own natural end (immediately, for a hold note once sweepHoldNotes finalizes it), so
   *  the cursor still stays within a few hundred ms of "now" rather than growing with song length. */
  private advanceCursor(): void {
    while (this.cursor < this.notes.length && this.judgedIds.has(this.notes[this.cursor].id)) {
      this.cursor++;
    }
  }

  /** Call when the player attempts a hit (key press) on a lane. Returns null if no nearby note
   *  exists for this lane (so idle presses aren't judged at all). */
  judgeAttempt(lane: number, songTimeMs: number): JudgmentResult | null {
    this.advanceCursor();
    let best: NoteEvent | null = null;
    let bestDelta = Infinity;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.timeMs - songTimeMs > BAD_WINDOW_MS) break; // sorted ascending — nothing further is any closer
      if (note.lane !== lane || this.judgedIds.has(note.id)) continue;
      const delta = Math.abs(note.timeMs - songTimeMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = note;
      }
    }
    if (!best || bestDelta > BAD_WINDOW_MS) return null;

    this.judgedIds.add(best.id);
    const tier: JudgmentTier =
      bestDelta <= EXCELLENT_WINDOW_MS ? "Excellent" : bestDelta <= GREAT_WINDOW_MS ? "Great" : bestDelta <= GOOD_WINDOW_MS ? "Good" : "Bad";
    return { tier, lane };
  }

  /** Call every frame with the current song time; notes that scrolled past the hit line with no
   *  matching attempt become a "Bad" (missed) judgment. Hold notes (durationMs set) are handled
   *  separately by markHoldActive/sweepHoldNotes instead, since "closest single attempt" doesn't
   *  apply to a "keep sliding for this whole window" note. */
  sweepMisses(songTimeMs: number): JudgmentResult[] {
    this.advanceCursor();
    const misses: JudgmentResult[] = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (songTimeMs - note.timeMs <= BAD_WINDOW_MS) break; // sorted ascending — nothing further has scrolled past yet
      if (note.durationMs || this.judgedIds.has(note.id)) continue;
      this.judgedIds.add(note.id);
      misses.push({ tier: "Bad", lane: note.lane });
    }
    return misses;
  }

  /** Call every frame with whether a qualifying hold action (e.g. scratch motion) is happening
   *  right now. Marks any hold note in `lane` whose [timeMs, timeMs+durationMs] window currently
   *  contains songTimeMs as "hit at least once" — a single qualifying moment anywhere in the window
   *  is enough, no timing precision required. */
  markHoldActive(lane: number, songTimeMs: number, isActionActive: boolean): void {
    if (!isActionActive) return;
    this.advanceCursor();
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.timeMs > songTimeMs) break; // sorted ascending — a hold that hasn't started yet can't contain songTimeMs
      if (note.lane !== lane || !note.durationMs || this.judgedIds.has(note.id)) continue;
      if (songTimeMs <= note.timeMs + note.durationMs) {
        this.holdWasActive.add(note.id);
      }
    }
  }

  /** Call every frame with the current song time; finalizes hold notes whose window has fully
   *  passed — "Great" if markHoldActive ever fired during the window, "Bad" (missed) otherwise. */
  sweepHoldNotes(lane: number, songTimeMs: number): JudgmentResult[] {
    this.advanceCursor();
    const results: JudgmentResult[] = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.timeMs > songTimeMs) break; // sorted ascending — a hold that hasn't started yet can't have ended either
      if (note.lane !== lane || !note.durationMs || this.judgedIds.has(note.id)) continue;
      if (songTimeMs > note.timeMs + note.durationMs) {
        this.judgedIds.add(note.id);
        const wasHit = this.holdWasActive.has(note.id);
        this.holdWasActive.delete(note.id);
        results.push({ tier: wasHit ? "Great" : "Bad", lane: note.lane });
      }
    }
    return results;
  }
}
