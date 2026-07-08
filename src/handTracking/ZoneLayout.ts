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

/** x, y must already be in displayed (mirrored) screen-space fractions, matching zone coordinates. */
export function findZoneAt(zones: KeyZone[], x: number, y: number): KeyZone | null {
  return zones.find((zone) => x >= zone.xMin && x < zone.xMax && y >= zone.yMin && y <= zone.yMax) ?? null;
}
