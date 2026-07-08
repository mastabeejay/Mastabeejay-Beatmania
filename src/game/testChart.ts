import { NUM_KEYS } from "../app/AppConfig";
import { SCRATCH_LANE, type ChartDensity, type NoteEvent } from "./types";

export type { ChartDensity };
export { DIFFICULTY_PRESETS } from "./types";

// How long (in beats) a scratch hold lasts — the player keeps sliding for this whole window,
// rendered as a capsule/tube rather than an instantaneous tap like the key notes.
const SCRATCH_HOLD_BEATS = 1;

/** Key notes cycle through all lanes at a fixed beat interval; scratch notes land at their own
 *  (coarser) interval, each held for SCRATCH_HOLD_BEATS. Both scale with difficulty independent of scroll speed. */
export function buildTestChart(bpm: number, beatCount: number, density: ChartDensity): NoteEvent[] {
  const msPerBeat = 60000 / bpm;
  const notes: NoteEvent[] = [];

  let laneIndex = 0;
  for (let i = 0; i < beatCount; i += density.beatsPerKeyNote) {
    notes.push({ id: `key-${i}`, timeMs: i * msPerBeat, lane: laneIndex % NUM_KEYS });
    laneIndex += 1;
  }
  for (let i = 0; i < beatCount; i += density.beatsPerScratchNote) {
    notes.push({ id: `scratch-${i}`, timeMs: i * msPerBeat, lane: SCRATCH_LANE, durationMs: SCRATCH_HOLD_BEATS * msPerBeat });
  }

  return notes;
}
