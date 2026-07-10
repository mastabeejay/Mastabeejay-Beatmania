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
  /** Chance (0-1) a key note gets nudged off the beat grid for a syncopated feel. The shift itself
   *  is scaled to a fraction of beatsPerKeyNote (see chart builders), so it can never grow large
   *  enough to collide with or invert the order of a neighboring note. */
  syncopationChance: number;
  /** Chance (0-1) of breaking up an otherwise-predictable or repeated lane pick with a different
   *  one, so higher difficulty moves between keys more often instead of settling into a pattern. */
  laneShuffleChance: number;
  /** Scratch hold length is randomized between these multiples of a beat (min, max) instead of a
   *  fixed duration, so higher difficulty mixes quick flicks with long holds. */
  scratchHoldBeatsRange: [number, number];
}

// Shared by both the hardcoded test chart and real auto-generated charts, so "easy/normal/hard"
// feels consistent regardless of which note source is playing.
export const DIFFICULTY_PRESETS: Record<"easy" | "normal" | "hard", ChartDensity> = {
  easy: { beatsPerKeyNote: 4, beatsPerScratchNote: 8, syncopationChance: 0, laneShuffleChance: 0, scratchHoldBeatsRange: [1, 1] },
  normal: { beatsPerKeyNote: 2, beatsPerScratchNote: 6, syncopationChance: 0.2, laneShuffleChance: 0.25, scratchHoldBeatsRange: [0.5, 1.5] },
  hard: { beatsPerKeyNote: 0.75, beatsPerScratchNote: 3, syncopationChance: 0.55, laneShuffleChance: 0.5, scratchHoldBeatsRange: [0.25, 2] },
};
