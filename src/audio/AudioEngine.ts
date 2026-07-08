async function renderClickTrack(sampleRate: number, bpm: number, beatCount: number): Promise<AudioBuffer> {
  const secondsPerBeat = 60 / bpm;
  const durationSec = beatCount * secondsPerBeat + 1;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(durationSec * sampleRate), sampleRate);

  for (let i = 0; i < beatCount; i++) {
    const t = i * secondsPerBeat;
    const isDownbeat = i % 5 === 0;

    const osc = offlineCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = isDownbeat ? 1400 : 900;

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(isDownbeat ? 0.7 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain).connect(offlineCtx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  return offlineCtx.startRendering();
}

export class AudioEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null;
  private startAudioCtxTime: number | null;
  private currentSource: AudioBufferSourceNode | null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.buffer = null;
    this.startAudioCtxTime = null;
    this.currentSource = null;
  }

  async loadClickTrack(bpm: number, beatCount: number): Promise<void> {
    this.buffer = await renderClickTrack(this.ctx.sampleRate, bpm, beatCount);
  }

  /** Use an already-decoded buffer directly — e.g. the user's own song, decoded once by ChartBuilder. */
  loadBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
  }

  play(): void {
    if (!this.buffer) {
      throw new Error("AudioEngine.loadClickTrack() must complete before play()");
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.ctx.destination);

    const startAt = this.ctx.currentTime + 0.15; // small lead-in so the scheduled start is precise
    source.start(startAt);
    this.startAudioCtxTime = startAt;
    this.currentSource = source;
  }

  stop(): void {
    this.currentSource?.stop();
    this.currentSource = null;
    this.startAudioCtxTime = null;
  }

  /** Song-time in ms, using the same clock notes are timestamped against. Negative during the lead-in. */
  getSongTimeMs(): number {
    if (this.startAudioCtxTime === null) return -Infinity;
    return (this.ctx.currentTime - this.startAudioCtxTime) * 1000;
  }

  getDurationMs(): number {
    return (this.buffer?.duration ?? 0) * 1000;
  }
}
