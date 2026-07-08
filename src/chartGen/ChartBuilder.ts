import type { ChartDensity, NoteEvent } from "../game/types";
import { assignLanes } from "./LaneAssigner";
import { detectOnsets } from "./OnsetDetector";
import { estimateTempo } from "./TempoEstimator";

export interface Chart {
  sourceFileName: string;
  durationMs: number;
  bpm: number;
  notes: NoteEvent[];
}

export interface BuiltChart {
  chart: Chart;
  audioBuffer: AudioBuffer;
}

/** Decodes a user-supplied audio file and generates a playable chart from it. Runs entirely
 *  client-side: no network round-trip, no server-authored chart data. Quality varies by track —
 *  this tracks the music's energy/timbre, it does not design deliberate hand patterns the way a
 *  human chart author would. */
export async function buildChartFromFile(ctx: AudioContext, file: File, density: ChartDensity): Promise<BuiltChart> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const durationMs = audioBuffer.duration * 1000;

  const [{ bpm, offsetMs }, onsetsByBand] = await Promise.all([
    estimateTempo(audioBuffer),
    Promise.resolve(detectOnsets(audioBuffer.getChannelData(0), audioBuffer.sampleRate)),
  ]);

  const notes = assignLanes(onsetsByBand, bpm, offsetMs, durationMs, density);

  return {
    chart: { sourceFileName: file.name, durationMs, bpm, notes },
    audioBuffer,
  };
}
