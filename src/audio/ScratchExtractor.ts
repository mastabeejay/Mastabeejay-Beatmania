const ANCHOR_SEARCH_DURATION_SEC = 12; // only look for the best moment within the file's intro

export interface ExtractedScratchSample {
  buffer: AudioBuffer;
  /** Seconds into the buffer where energy is highest — the best point to anchor scratch playback around. */
  anchorSec: number;
}

/** Uses the source audio as-is (no harmonic/percussive separation) — an earlier version ran the
 *  signal through STFT-based filtering to suppress the beat, but that median-filtering process
 *  itself attenuates energy across the board, and the real DJ-scratch source material here is
 *  already clean and consistently loud (peak ~0.6-0.74 throughout), so processing it only made it
 *  quieter for no benefit. This finds the liveliest ~1s window within the file's intro to anchor
 *  around, and normalizes against that region's peak. */
export async function extractScratchSample(_ctx: AudioContext, sourceBuffer: AudioBuffer): Promise<ExtractedScratchSample> {
  const sampleRate = sourceBuffer.sampleRate;
  const data = sourceBuffer.getChannelData(0);
  const searchLength = Math.min(data.length, Math.floor(ANCHOR_SEARCH_DURATION_SEC * sampleRate));

  const analysisWindowSamples = Math.floor(1.0 * sampleRate);
  const searchStepSamples = Math.floor(0.25 * sampleRate);
  let bestStart = 0;
  let bestEnergy = -1;
  for (let start = 0; start + analysisWindowSamples <= searchLength; start += searchStepSamples) {
    let sumSq = 0;
    for (let i = start; i < start + analysisWindowSamples; i++) sumSq += data[i] * data[i];
    if (sumSq > bestEnergy) {
      bestEnergy = sumSq;
      bestStart = start;
    }
  }
  const anchorSec = (bestStart + analysisWindowSamples / 2) / sampleRate;

  // Normalize against the peak within the intro region actually being used, not the whole file —
  // keeps the used material consistently loud regardless of what the rest of the track looks like.
  let peak = 0;
  for (let i = 0; i < searchLength; i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? Math.min(4, 1.0 / peak) : 1;

  let buffer = sourceBuffer;
  if (Math.abs(scale - 1) > 0.02) {
    const copy = new AudioBuffer({
      length: sourceBuffer.length,
      numberOfChannels: sourceBuffer.numberOfChannels,
      sampleRate: sourceBuffer.sampleRate,
    });
    for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
      const src = sourceBuffer.getChannelData(ch);
      const dst = copy.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] = Math.max(-1, Math.min(1, src[i] * scale));
    }
    buffer = copy;
  }

  return { buffer, anchorSec };
}
