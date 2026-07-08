import type { HandFrame } from "../handTracking/types";

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];

export class DebugSkeletonRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  draw(hands: HandFrame[], width: number, height: number): void {
    for (const hand of hands) {
      // Landmarks come from the raw (unmirrored) video frame; mirror x to match
      // the mirrored <video> element the user actually sees on screen.
      const points = hand.landmarks.map((lm) => ({
        x: (1 - lm.x) * width,
        y: lm.y * height,
      }));

      this.ctx.strokeStyle = hand.handedness === "Left" ? "#4fc3f7" : "#ff8a65";
      this.ctx.lineWidth = 2;
      for (const [a, b] of HAND_CONNECTIONS) {
        this.ctx.beginPath();
        this.ctx.moveTo(points[a].x, points[a].y);
        this.ctx.lineTo(points[b].x, points[b].y);
        this.ctx.stroke();
      }

      this.ctx.fillStyle = "#fff";
      for (const p of points) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }

      const label = hand.handedness === "Left" ? "L" : "R";
      this.ctx.fillStyle = hand.handedness === "Left" ? "#4fc3f7" : "#ff8a65";
      this.ctx.font = "16px sans-serif";
      this.ctx.fillText(label, points[0].x + 10, points[0].y + 10);
    }
  }
}
