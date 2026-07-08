import type { NoteEvent } from "./types";

export class NoteScheduler {
  private notes: NoteEvent[];

  constructor(notes: NoteEvent[]) {
    this.notes = notes;
  }

  getVisibleNotes(songTimeMs: number, lookaheadMs: number, trailMs: number): NoteEvent[] {
    return this.notes.filter((note) => {
      const timeUntilHit = note.timeMs - songTimeMs;
      return timeUntilHit <= lookaheadMs && timeUntilHit >= -trailMs;
    });
  }
}
