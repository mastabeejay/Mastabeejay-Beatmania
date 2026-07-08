import {
  PRESS_DEBOUNCE_MS,
  PRESS_Y_VELOCITY_THRESHOLD,
  PRESS_Z_VELOCITY_THRESHOLD,
  VELOCITY_WINDOW_MS,
} from "../app/AppConfig";
import { computeKeyZones, findZoneAt, type KeyZone } from "./ZoneLayout";
import type { FingertipDebugSample, HandFrame, PressEvent } from "./types";

const FINGERTIP_LANDMARKS = [4, 8, 12, 16, 20];
const FINGERTIP_NAMES = ["thumb", "index", "middle", "ring", "pinky"];

interface Sample {
  timestampMs: number;
  x: number;
  y: number;
  z: number;
}

export interface PressAttempt {
  key: string;
  x: number;
  y: number;
}

export interface GestureProcessResult {
  events: PressEvent[];
  debug: FingertipDebugSample[];
  /** Debounced press-onset edges, regardless of whether the position fell inside a computed zone —
   *  used by calibration, which needs to know "a press just happened here" before zones are final. */
  pressAttempts: PressAttempt[];
}

export class GestureDetector {
  private zones: KeyZone[];
  private history: Map<string, Sample[]>;
  private lastPressTime: Map<string, number>;

  constructor(zones?: KeyZone[]) {
    this.zones = zones ?? computeKeyZones();
    this.history = new Map();
    this.lastPressTime = new Map();
  }

  getZones(): KeyZone[] {
    return this.zones;
  }

  /** Swap in newly calibrated zones (e.g. after finger calibration) without losing velocity history. */
  setZones(zones: KeyZone[]): void {
    this.zones = zones;
  }

  process(hands: HandFrame[], frameTimestampMs: number): GestureProcessResult {
    const events: PressEvent[] = [];
    const debug: FingertipDebugSample[] = [];
    const pressAttempts: PressAttempt[] = [];

    for (const hand of hands) {
      for (let i = 0; i < FINGERTIP_LANDMARKS.length; i++) {
        const lm = hand.landmarks[FINGERTIP_LANDMARKS[i]];
        const key = `${hand.handedness}-${FINGERTIP_NAMES[i]}`;
        // Landmarks come from the raw (unmirrored) video frame; mirror x so it
        // matches the displayed (mirrored) video and the zone coordinates below.
        const mirroredX = 1 - lm.x;

        const samples = this.history.get(key) ?? [];
        samples.push({ timestampMs: frameTimestampMs, x: mirroredX, y: lm.y, z: lm.z });
        while (samples.length > 1 && frameTimestampMs - samples[0].timestampMs > VELOCITY_WINDOW_MS) {
          samples.shift();
        }
        this.history.set(key, samples);

        if (samples.length < 2) {
          debug.push({ key, x: mirroredX, y: lm.y, pressScore: 0 });
          continue;
        }

        const oldest = samples[0];
        const dt = frameTimestampMs - oldest.timestampMs;
        if (dt <= 0) continue;

        const zVelocity = (lm.z - oldest.z) / dt; // negative = moving toward camera
        const yVelocity = (lm.y - oldest.y) / dt; // positive = moving down

        const zScore = Math.max(0, -zVelocity) / PRESS_Z_VELOCITY_THRESHOLD;
        const yScore = Math.max(0, yVelocity) / PRESS_Y_VELOCITY_THRESHOLD;
        const pressScore = Math.max(zScore, yScore);

        debug.push({ key, x: mirroredX, y: lm.y, pressScore });

        const lastPress = this.lastPressTime.get(key) ?? -Infinity;
        if (pressScore >= 1 && frameTimestampMs - lastPress >= PRESS_DEBOUNCE_MS) {
          this.lastPressTime.set(key, frameTimestampMs);
          pressAttempts.push({ key, x: mirroredX, y: lm.y });

          const zone = findZoneAt(this.zones, mirroredX, lm.y);
          if (zone) {
            events.push({ lane: zone.lane, fingertipKey: key, timestampMs: frameTimestampMs, pressScore });
          }
        }
      }
    }

    return { events, debug, pressAttempts };
  }
}
