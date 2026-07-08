import { SCRATCH_LANE, type ChartDensity, type NoteEvent } from "../game/types";
import type { Onset } from "./OnsetDetector";

// How long (in beats) a scratch hold lasts — rendered as a capsule/tube the player keeps sliding
// through, rather than an instantaneous tap like the key notes.
const SCRATCH_HOLD_BEATS = 1;

/** Each band already maps 1:1 to a key lane (band index === lane index). Raw multi-band onset
 *  detection on a busy track wildly over-generates notes, so this enforces a minimum gap between
 *  ANY two notes across all lanes combined — scaled by the same ChartDensity presets the hardcoded
 *  test chart uses (beatsPerKeyNote * msPerBeat), so "easy/normal/hard" feels consistent whether
 *  you're playing the test track or a real song. Keeps the stronger onset on conflict. */
function buildKeyNotes(onsetsByBand: Onset[][], bpm: number, density: ChartDensity): NoteEvent[] {
  const minGapMs = density.beatsPerKeyNote * (60000 / bpm);
  const allOnsets = onsetsByBand.flat().sort((a, b) => a.timeMs - b.timeMs);

  const kept: Onset[] = [];
  for (const onset of allOnsets) {
    const last = kept[kept.length - 1];
    if (last && onset.timeMs - last.timeMs < minGapMs) {
      if (onset.strength > last.strength) kept[kept.length - 1] = onset;
      continue;
    }
    kept.push(onset);
  }

  return kept.map((onset, i) => ({ id: `key-${i}`, timeMs: onset.timeMs, lane: onset.band }));
}

/** Scratch notes land on a beat-grid interval (from the estimated tempo/offset, spaced by
 *  beatsPerScratchNote), snapped onto a nearby bass-lane onset when one exists — mirrors real charts
 *  using scratch on strong rhythmic anchors rather than purely on bass presence. */
function buildScratchNotes(keyNotes: NoteEvent[], bpm: number, offsetMs: number, durationMs: number, density: ChartDensity): NoteEvent[] {
  const msPerBeat = 60000 / bpm;
  const snapWindowMs = 60;
  const scratchNotes: NoteEvent[] = [];
  let index = 0;

  for (let t = offsetMs; t < durationMs; t += msPerBeat * density.beatsPerScratchNote) {
    const nearbyBass = keyNotes.find((note) => note.lane === 0 && Math.abs(note.timeMs - t) < snapWindowMs);
    scratchNotes.push({
      id: `scratch-${index}`,
      timeMs: nearbyBass?.timeMs ?? t,
      lane: SCRATCH_LANE,
      durationMs: SCRATCH_HOLD_BEATS * msPerBeat,
    });
    index += 1;
  }

  return scratchNotes;
}

export function assignLanes(onsetsByBand: Onset[][], bpm: number, offsetMs: number, durationMs: number, density: ChartDensity): NoteEvent[] {
  const keyNotes = buildKeyNotes(onsetsByBand, bpm, density);
  const scratchNotes = buildScratchNotes(keyNotes, bpm, offsetMs, durationMs, density);
  return [...keyNotes, ...scratchNotes];
}
