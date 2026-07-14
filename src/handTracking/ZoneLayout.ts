import {
  KEY_GAP_PCT,
  KEY_WIDTH_PCT,
  KEY_ZONE_X_START,
  KEY_ZONE_Y_RANGE,
  NUM_KEYS,
  SCRATCH_DISK_CENTER,
  SCRATCH_DISK_RADIUS_PCT,
} from "../app/AppConfig";

export interface KeyZone {
  lane: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ScratchZone {
  centerXPct: number;
  centerYPct: number;
  radiusPct: number;
}

export function computeKeyZones(): KeyZone[] {
  const [yMin, yMax] = KEY_ZONE_Y_RANGE;
  const zones: KeyZone[] = [];
  for (let lane = 0; lane < NUM_KEYS; lane++) {
    const xMin = KEY_ZONE_X_START + lane * (KEY_WIDTH_PCT + KEY_GAP_PCT);
    zones.push({ lane, xMin, xMax: xMin + KEY_WIDTH_PCT, yMin, yMax });
  }
  return zones;
}

export function computeScratchZone(): ScratchZone {
  return {
    centerXPct: SCRATCH_DISK_CENTER.xPct,
    centerYPct: SCRATCH_DISK_CENTER.yPct,
    radiusPct: SCRATCH_DISK_RADIUS_PCT,
  };
}

export interface ResolvedScratchZone {
  cx: number;
  cy: number;
  r: number;
}

/** Resolves a ScratchZone's fractional geometry into actual pixels for the CURRENT canvas size,
 *  clamping the vertical center so the disk never extends past the bottom edge. centerYPct was
 *  tuned against a tall portrait aspect, where min(width,height) (the radius's basis) is much
 *  smaller than height itself; in landscape they're much closer together, so the same fraction of
 *  height left almost no margin below the disk and it clipped off-screen. Every consumer (the
 *  renderer, hit-testing, note/judgment placement) must go through this one function rather than
 *  each re-deriving cx/cy/r itself, or the visual disk and the interactive zone could drift apart. */
export function resolveScratchZone(zone: ScratchZone, width: number, height: number): ResolvedScratchZone {
  const r = zone.radiusPct * Math.min(width, height);
  const marginPx = 12;
  const idealCy = zone.centerYPct * height;
  return { cx: zone.centerXPct * width, cy: Math.min(idealCy, height - r - marginPx), r };
}

/** x, y must already be in displayed (mirrored) screen-space fractions, matching zone coordinates. */
export function findZoneAt(zones: KeyZone[], x: number, y: number): KeyZone | null {
  return zones.find((zone) => x >= zone.xMin && x < zone.xMax && y >= zone.yMin && y <= zone.yMax) ?? null;
}
