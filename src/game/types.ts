export const SCRATCH_LANE = -1;

export interface NoteEvent {
  id: string;
  timeMs: number;
  lane: number;
  /** Optional hold length (ms) — used by scratch notes to represent a "keep sliding for this long"
   *  window rather than a single instant. Undefined/0 means an instantaneous tap. */
  durationMs?: number;
}

export interface ChartDensity {
  beatsPerKeyNote: number;
  beatsPerScratchNote: number;
}

// Shared by both the hardcoded test chart and real auto-generated charts, so "easy/normal/hard"
// feels consistent regardless of which note source is playing.
export const DIFFICULTY_PRESETS: Record<"easy" | "normal" | "hard", ChartDensity> = {
  easy: { beatsPerKeyNote: 4, beatsPerScratchNote: 8 },
  normal: { beatsPerKeyNote: 2, beatsPerScratchNote: 6 },
  hard: { beatsPerKeyNote: 1, beatsPerScratchNote: 4 },
};
