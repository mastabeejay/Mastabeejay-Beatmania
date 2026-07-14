import type { HandFrame } from "./types";
import { resolveScratchZone, type ScratchZone } from "./ZoneLayout";

const ENTER_RADIUS_MULT = 1.2;
const EXIT_RADIUS_MULT = 1.4;
const PALM_LANDMARKS = [0, 5, 9, 13, 17];
// Radians of visual disk spin per "radius" of vertical hand travel — purely cosmetic, tuned so a
// natural up/down rub visibly spins the disk (like rubbing a real record up/down does).
const SPIN_SENSITIVITY = 3;

export interface ScratchEvent {
  timestampMs: number;
  /** Disk-radii per second (resolution-independent). Positive = rubbing down, negative = rubbing up. */
  scratchVelocityPerSec: number;
  direction: "down" | "up" | "none";
}

function averagePalmCenter(landmarks: HandFrame["landmarks"]): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  for (const index of PALM_LANDMARKS) {
    sumX += landmarks[index].x;
    sumY += landmarks[index].y;
  }
  return { x: sumX / PALM_LANDMARKS.length, y: sumY / PALM_LANDMARKS.length };
}

/** Detects a simple linear rub (up-down) motion within the scratch disk zone — bring your hand into
 *  the disk, then rub it vertically to scratch, rather than orbiting the disk's center. */
export class ScratchDetector {
  private engaged: boolean;
  private lastYNorm: number | null;
  private lastTimestampMs: number | null;
  private rotationRad: number;
  private smoothedVelocity: number;

  constructor() {
    this.engaged = false;
    this.lastYNorm = null;
    this.lastTimestampMs = null;
    this.rotationRad = 0;
    this.smoothedVelocity = 0;
  }

  isEngaged(): boolean {
    return this.engaged;
  }

  /** Accumulated rotation angle (radians), purely for driving the disk's visual spin. */
  getRotationRad(): number {
    return this.rotationRad;
  }

  /** Current smoothed rub velocity, readable every frame regardless of whether process() returned an event this frame. */
  getScratchVelocityPerSec(): number {
    return this.smoothedVelocity;
  }

  process(hands: HandFrame[], frameTimestampMs: number, zone: ScratchZone, canvasWidth: number, canvasHeight: number): ScratchEvent | null {
    const { cx, cy, r } = resolveScratchZone(zone, canvasWidth, canvasHeight);

    let closest: { x: number; y: number; dist: number } | null = null;
    for (const hand of hands) {
      const palm = averagePalmCenter(hand.landmarks);
      // Mirror x to match displayed video / zone coordinates, same convention as GestureDetector.
      const px = (1 - palm.x) * canvasWidth;
      const py = palm.y * canvasHeight;
      const dist = Math.hypot(px - cx, py - cy);
      if (!closest || dist < closest.dist) {
        closest = { x: px, y: py, dist };
      }
    }

    if (!closest) {
      this.resetEngagement();
      return null;
    }

    if (this.engaged) {
      if (closest.dist > r * EXIT_RADIUS_MULT) {
        this.resetEngagement();
        return null;
      }
    } else if (closest.dist <= r * ENTER_RADIUS_MULT) {
      this.engaged = true;
    } else {
      return null;
    }

    const yNorm = (closest.y - cy) / r; // resolution-independent, in disk radii

    if (this.lastYNorm === null || this.lastTimestampMs === null) {
      this.lastYNorm = yNorm;
      this.lastTimestampMs = frameTimestampMs;
      return null;
    }

    const dt = frameTimestampMs - this.lastTimestampMs;
    const dyNorm = yNorm - this.lastYNorm;
    this.lastYNorm = yNorm;
    this.lastTimestampMs = frameTimestampMs;
    this.rotationRad += dyNorm * SPIN_SENSITIVITY;
    if (dt <= 0) return null;

    const instantVelocity = dyNorm / (dt / 1000);
    this.smoothedVelocity = this.smoothedVelocity * 0.7 + instantVelocity * 0.3;
    const direction = this.smoothedVelocity > 0.5 ? "down" : this.smoothedVelocity < -0.5 ? "up" : "none";

    return { timestampMs: frameTimestampMs, scratchVelocityPerSec: this.smoothedVelocity, direction };
  }

  private resetEngagement(): void {
    this.engaged = false;
    this.lastYNorm = null;
    this.lastTimestampMs = null;
    this.smoothedVelocity = 0;
  }
}
