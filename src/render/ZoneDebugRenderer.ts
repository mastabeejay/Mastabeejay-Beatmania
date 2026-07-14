import { resolveScratchZone, type KeyZone, type ScratchZone } from "../handTracking/ZoneLayout";
import type { FingertipDebugSample, PressEvent } from "../handTracking/types";

export class ZoneDebugRenderer {
  private ctx: CanvasRenderingContext2D;
  private flashUntilByLane: Map<number, number>;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.flashUntilByLane = new Map();
  }

  registerPresses(events: PressEvent[]): void {
    for (const event of events) {
      this.flashUntilByLane.set(event.lane, performance.now() + 150);
    }
  }

  draw(zones: KeyZone[], fingertipDebug: FingertipDebugSample[], width: number, height: number): void {
    const now = performance.now();

    for (const zone of zones) {
      const x = zone.xMin * width;
      const y = zone.yMin * height;
      const w = (zone.xMax - zone.xMin) * width;
      const h = (zone.yMax - zone.yMin) * height;
      const isFlashing = now < (this.flashUntilByLane.get(zone.lane) ?? 0);

      this.ctx.fillStyle = isFlashing ? "rgba(255, 210, 0, 0.55)" : "rgba(255, 255, 255, 0.08)";
      this.ctx.fillRect(x, y, w, h);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, w, h);

      this.ctx.fillStyle = "#fff";
      this.ctx.font = "20px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText(String(zone.lane + 1), x + w / 2, y + h / 2);
    }
    this.ctx.textAlign = "start";

    // Per-fingertip press-score readout, for tuning PRESS_*_VELOCITY_THRESHOLD by feel.
    this.ctx.font = "12px monospace";
    for (const sample of fingertipDebug) {
      const px = sample.x * width;
      const py = sample.y * height;
      this.ctx.fillStyle = sample.pressScore >= 1 ? "#ffd200" : "rgba(255, 255, 255, 0.7)";
      this.ctx.fillText(sample.pressScore.toFixed(1), px + 8, py - 8);
    }
  }

  /** Semi-transparent black turntable disk. Brightens slightly and gets an accent-colored rim when
   *  the hand is engaged; the marker line rotates with rotationRad so the disk visibly spins with
   *  the detected up/down rub motion. */
  drawScratchDisk(zone: ScratchZone, rotationRad: number, engaged: boolean, width: number, height: number): void {
    const { cx, cy, r } = resolveScratchZone(zone, width, height);

    this.ctx.fillStyle = engaged ? "rgba(15, 15, 15, 0.72)" : "rgba(10, 10, 10, 0.55)";
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = engaged ? "rgba(255, 210, 0, 0.85)" : "rgba(255, 255, 255, 0.35)";
    this.ctx.lineWidth = engaged ? 3 : 2;
    this.ctx.stroke();

    // Vinyl-style concentric grooves.
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    this.ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, (r * i) / 5, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Center spindle + marker line that rotates with detected rub motion.
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(rotationRad);
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(0, -r * 0.9);
    this.ctx.stroke();
    this.ctx.restore();

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
