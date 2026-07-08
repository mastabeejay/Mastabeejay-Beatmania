import type { NoteEvent } from "./types";

export type JudgmentTier = "Great" | "Good" | "Bad";

export interface JudgmentResult {
  tier: JudgmentTier;
  lane: number;
}

const GREAT_WINDOW_MS = 100;
const GOOD_WINDOW_MS = 220;
const BAD_WINDOW_MS = 400; // outer bound: a press further off than this from any note is ignored, not judged

export class JudgmentEngine {
  private notes: NoteEvent[];
  private judgedIds: Set<string>;
  private holdWasActive: Set<string>;

  constructor(notes: NoteEvent[]) {
    this.notes = notes;
    this.judgedIds = new Set();
    this.holdWasActive = new Set();
  }

  /** Call when the player attempts a hit (key press) on a lane. Returns null if no nearby note
   *  exists for this lane (so idle presses aren't judged at all). */
  judgeAttempt(lane: number, songTimeMs: number): JudgmentResult | null {
    let best: NoteEvent | null = null;
    let bestDelta = Infinity;
    for (const note of this.notes) {
      if (note.lane !== lane || this.judgedIds.has(note.id)) continue;
      const delta = Math.abs(note.timeMs - songTimeMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = note;
      }
    }
    if (!best || bestDelta > BAD_WINDOW_MS) return null;

    this.judgedIds.add(best.id);
    const tier: JudgmentTier = bestDelta <= GREAT_WINDOW_MS ? "Great" : bestDelta <= GOOD_WINDOW_MS ? "Good" : "Bad";
    return { tier, lane };
  }

  /** Call every frame with the current song time; notes that scrolled past the hit line with no
   *  matching attempt become a "Bad" (missed) judgment. Hold notes (durationMs set) are handled
   *  separately by markHoldActive/sweepHoldNotes instead, since "closest single attempt" doesn't
   *  apply to a "keep sliding for this whole window" note. */
  sweepMisses(songTimeMs: number): JudgmentResult[] {
    const misses: JudgmentResult[] = [];
    for (const note of this.notes) {
      if (note.durationMs || this.judgedIds.has(note.id)) continue;
      if (songTimeMs - note.timeMs > BAD_WINDOW_MS) {
        this.judgedIds.add(note.id);
        misses.push({ tier: "Bad", lane: note.lane });
      }
    }
    return misses;
  }

  /** Call every frame with whether a qualifying hold action (e.g. scratch motion) is happening
   *  right now. Marks any hold note in `lane` whose [timeMs, timeMs+durationMs] window currently
   *  contains songTimeMs as "hit at least once" — a single qualifying moment anywhere in the window
   *  is enough, no timing precision required. */
  markHoldActive(lane: number, songTimeMs: number, isActionActive: boolean): void {
    if (!isActionActive) return;
    for (const note of this.notes) {
      if (note.lane !== lane || !note.durationMs || this.judgedIds.has(note.id)) continue;
      if (songTimeMs >= note.timeMs && songTimeMs <= note.timeMs + note.durationMs) {
        this.holdWasActive.add(note.id);
      }
    }
  }

  /** Call every frame with the current song time; finalizes hold notes whose window has fully
   *  passed — "Great" if markHoldActive ever fired during the window, "Bad" (missed) otherwise. */
  sweepHoldNotes(lane: number, songTimeMs: number): JudgmentResult[] {
    const results: JudgmentResult[] = [];
    for (const note of this.notes) {
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
