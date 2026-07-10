import { NUM_KEYS } from "../app/AppConfig";
import { SCRATCH_LANE, type ChartDensity, type NoteEvent } from "../game/types";
import type { Onset } from "./OnsetDetector";

/** Each band already maps 1:1 to a key lane (band index === lane index). Raw multi-band onset
 *  detection on a busy track wildly over-generates notes, so this enforces a minimum gap between
 *  ANY two notes across all lanes combined — scaled by the same ChartDensity presets the hardcoded
 *  test chart uses (beatsPerKeyNote * msPerBeat), so "easy/normal/hard" feels consistent whether
 *  you're playing the test track or a real song. Keeps the stronger onset on conflict.
 *
 *  Higher difficulty then layers in two effects on top of the filtered onsets: syncopation (a small
 *  timing nudge, capped well under minGapMs so notes can't collide or invert order) and lane
 *  anti-repeat shuffling (breaks up a run of onsets landing in the same band/lane, which is where
 *  "same key over and over" tedium actually comes from on a real song — a legitimate audio-driven
 *  repeat elsewhere is left alone). */
function buildKeyNotes(onsetsByBand: Onset[][], bpm: number, density: ChartDensity): NoteEvent[] {
  const msPerBeat = 60000 / bpm;
  const minGapMs = density.beatsPerKeyNote * msPerBeat;
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

  const notes: NoteEvent[] = [];
  let previousLane = -1;
  for (let i = 0; i < kept.length; i++) {
    const onset = kept[i];

    let lane = onset.band;
    if (lane === previousLane && Math.random() < density.laneShuffleChance) {
      const otherLanes = Array.from({ length: NUM_KEYS }, (_, l) => l).filter((l) => l !== lane);
      lane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
    }
    previousLane = lane;

    const syncopated = Math.random() < density.syncopationChance;
    const maxShiftMs = minGapMs * 0.25; // stays well clear of the neighboring note's gap
    const timeMs = syncopated ? onset.timeMs + (Math.random() < 0.5 ? -1 : 1) * maxShiftMs : onset.timeMs;

    notes.push({ id: `key-${i}`, timeMs, lane });
  }

  return notes;
}

/** Scratch notes land on a beat-grid interval (from the estimated tempo/offset, spaced by
 *  beatsPerScratchNote), snapped onto a nearby bass-lane onset when one exists — mirrors real charts
 *  using scratch on strong rhythmic anchors rather than purely on bass presence. Hold length is
 *  randomized within density.scratchHoldBeatsRange so higher difficulty mixes quick flicks with
 *  long holds instead of a single fixed duration. */
function buildScratchNotes(keyNotes: NoteEvent[], bpm: number, offsetMs: number, durationMs: number, density: ChartDensity): NoteEvent[] {
  const msPerBeat = 60000 / bpm;
  const snapWindowMs = 60;
  const [minHoldBeats, maxHoldBeats] = density.scratchHoldBeatsRange;
  const scratchNotes: NoteEvent[] = [];
  let index = 0;

  for (let t = offsetMs; t < durationMs; t += msPerBeat * density.beatsPerScratchNote) {
    const nearbyBass = keyNotes.find((note) => note.lane === 0 && Math.abs(note.timeMs - t) < snapWindowMs);
    const holdBeats = minHoldBeats + Math.random() * (maxHoldBeats - minHoldBeats);
    scratchNotes.push({
      id: `scratch-${index}`,
      timeMs: nearbyBass?.timeMs ?? t,
      lane: SCRATCH_LANE,
      durationMs: holdBeats * msPerBeat,
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
