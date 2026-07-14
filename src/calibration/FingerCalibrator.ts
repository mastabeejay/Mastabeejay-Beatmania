import { NUM_KEYS } from "../app/AppConfig";
import type { HandFrame } from "../handTracking/types";
import type { KeyZone } from "../handTracking/ZoneLayout";

const FINGERTIP_LANDMARKS = [4, 8, 12, 16, 20];
const ZONE_HALF_HEIGHT_PCT = 0.09;
const WIDTH_COVERAGE = 0.8;
const MIN_HALF_WIDTH_PCT = 0.02;

interface Point {
  x: number;
  y: number;
}

/** Blends two calibration sources: a quick "rest pose" average (fast, but the resting position of a
 *  relaxed hand isn't exactly where a press lands) and per-lane press samples gathered while the
 *  player actually presses each lane a few times (slower, but reflects real press position). Press
 *  samples win per-lane whenever available; rest pose is the fallback for lanes with no samples yet. */
export class FingerCalibrator {
  private restSumX: number[];
  private restSumY: number[];
  private restCount: number;
  private pressSamplesByLane: Map<number, Point[]>;

  constructor() {
    this.restSumX = new Array(NUM_KEYS).fill(0);
    this.restSumY = new Array(NUM_KEYS).fill(0);
    this.restCount = 0;
    this.pressSamplesByLane = new Map();
  }

  addRestSample(hands: HandFrame[]): void {
    // Prefer the actual detected left hand; MediaPipe doesn't guarantee array order, so falling
    // back to hands[0] risked calibrating against a right hand that drifted into frame.
    const hand = hands.find((h) => h.handedness === "Left") ?? hands[0];
    if (!hand) return;

    const tips = FINGERTIP_LANDMARKS.map((index) => ({
      x: 1 - hand.landmarks[index].x, // mirror to match displayed video, same convention as GestureDetector
      y: hand.landmarks[index].y,
    })).sort((a, b) => a.x - b.x);

    for (let i = 0; i < NUM_KEYS && i < tips.length; i++) {
      this.restSumX[i] += tips[i].x;
      this.restSumY[i] += tips[i].y;
    }
    this.restCount += 1;
  }

  addPressSample(lane: number, x: number, y: number): void {
    const list = this.pressSamplesByLane.get(lane) ?? [];
    list.push({ x, y });
    this.pressSamplesByLane.set(lane, list);
  }

  computeZones(): KeyZone[] {
    const hasRest = this.restCount > 0;
    const restX = hasRest ? this.restSumX.map((sum) => sum / this.restCount) : null;
    const restY = hasRest ? this.restSumY.map((sum) => sum / this.restCount) : null;
    const restCenterY = restY ? restY.reduce((a, b) => a + b, 0) / restY.length : 0.7;

    const centers: Point[] = [];
    for (let lane = 0; lane < NUM_KEYS; lane++) {
      const pressSamples = this.pressSamplesByLane.get(lane) ?? [];
      if (pressSamples.length > 0) {
        centers.push({
          x: pressSamples.reduce((sum, p) => sum + p.x, 0) / pressSamples.length,
          y: pressSamples.reduce((sum, p) => sum + p.y, 0) / pressSamples.length,
        });
      } else if (restX && restY) {
        centers.push({ x: restX[lane], y: restCenterY });
      } else {
        // No data at all for this lane (calibration skipped/failed entirely) — evenly-spaced fallback.
        centers.push({ x: 0.15 + lane * 0.1, y: 0.7 });
      }
    }

    return centers.map((center, lane) => {
      const leftGap = lane > 0 ? center.x - centers[lane - 1].x : centers[1].x - centers[0].x;
      const rightGap = lane < NUM_KEYS - 1 ? centers[lane + 1].x - center.x : centers[NUM_KEYS - 1].x - centers[NUM_KEYS - 2].x;
      const halfWidth = Math.max(MIN_HALF_WIDTH_PCT, (Math.min(Math.abs(leftGap), Math.abs(rightGap)) * WIDTH_COVERAGE) / 2);

      return {
        lane,
        xMin: center.x - halfWidth,
        xMax: center.x + halfWidth,
        yMin: center.y - ZONE_HALF_HEIGHT_PCT,
        yMax: center.y + ZONE_HALF_HEIGHT_PCT,
      };
    });
  }
}
