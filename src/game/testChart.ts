import { NUM_KEYS } from "../app/AppConfig";
import { SCRATCH_LANE, type ChartDensity, type NoteEvent } from "./types";

export type { ChartDensity };
export { DIFFICULTY_PRESETS } from "./types";

/** Key notes cycle through lanes at a fixed beat interval by default; scratch notes land at their
 *  own (coarser) interval. Higher difficulty layers in: syncopation (a note nudged off the beat
 *  grid — shifted by a fraction of the note spacing itself, so it can't drift far enough to collide
 *  with a neighbor), lane shuffling (replaces the otherwise fully predictable 0,1,2,3,4,0,1... cycle
 *  with an occasional random jump), and scratch holds that vary in length instead of a fixed
 *  duration. */
export function buildTestChart(bpm: number, beatCount: number, density: ChartDensity): NoteEvent[] {
  const msPerBeat = 60000 / bpm;
  const notes: NoteEvent[] = [];

  let laneIndex = 0;
  let previousLane = -1;
  for (let i = 0; i < beatCount; i += density.beatsPerKeyNote) {
    let lane: number;
    if (Math.random() < density.laneShuffleChance) {
      do {
        lane = Math.floor(Math.random() * NUM_KEYS);
      } while (lane === previousLane && NUM_KEYS > 1);
    } else {
      lane = laneIndex % NUM_KEYS;
    }
    laneIndex += 1;
    previousLane = lane;

    const syncopated = Math.random() < density.syncopationChance;
    const offsetBeats = syncopated ? (Math.random() < 0.5 ? -1 : 1) * density.beatsPerKeyNote * 0.25 : 0;
    const timeMs = Math.max(0, (i + offsetBeats) * msPerBeat);

    notes.push({ id: `key-${i}`, timeMs, lane });
  }

  const [minHoldBeats, maxHoldBeats] = density.scratchHoldBeatsRange;
  for (let i = 0; i < beatCount; i += density.beatsPerScratchNote) {
    const holdBeats = minHoldBeats + Math.random() * (maxHoldBeats - minHoldBeats);
    notes.push({ id: `scratch-${i}`, timeMs: i * msPerBeat, lane: SCRATCH_LANE, durationMs: holdBeats * msPerBeat });
  }

  return notes;
}
