import { guess } from "web-audio-beat-detector";

export interface TempoResult {
  bpm: number;
  offsetMs: number;
}

const FALLBACK: TempoResult = { bpm: 120, offsetMs: 0 };

/** Wraps web-audio-beat-detector; falls back to a plain 120 BPM guess if detection fails
 *  (e.g. on audio with no clear percussive beat). */
export async function estimateTempo(audioBuffer: AudioBuffer): Promise<TempoResult> {
  try {
    const { bpm, offset } = await guess(audioBuffer);
    return { bpm, offsetMs: offset * 1000 };
  } catch {
    return FALLBACK;
  }
}
