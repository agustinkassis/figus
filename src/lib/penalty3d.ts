// ─── 3D scene constants for the penalty game ─────────────────────────────────
// penalty.ts  → game logic (resolveKick, zones, commit-reveal)
// penalty3d.ts → 3D coordinate system (shared by PenaltyScene3D and animation)

export const GOAL_Z      = -4;          // goal sits at z = -4
export const GOAL_W      = 7.32;        // real goal width (m)
export const HALF_W      = GOAL_W / 2;
export const GOAL_H      = 2.44;        // real goal height (m)
export const POST_R      = 0.07;        // post / crossbar radius
export const NET_DEPTH   = 1.3;         // depth of the goal box
export const FLIGHT_TIME = 0.92;        // ball flight duration in seconds

// Camera — matches demo's CAM_BASE / CAM_LOOK
export const CAM_POS  = [0, 1.3, 2.5] as const;
export const CAM_LOOK = [0, 1.15, GOAL_Z] as const;

// Ball resting on the penalty spot
export const BALL_HOME = [0, 0.12, 0] as const;

// Zone 3D positions: rows 0-2 (top→bottom), cols 0-2 (left→right)
// zones 0-2 = top, 3-5 = middle, 6-8 = bottom
export const COL_X = [-2.05, 0, 2.05] as [number, number, number];
export const ROW_Y = [2.05, 1.25, 0.55] as [number, number, number];

/** 3D world position for a shot aimed at zone 0-2 (left/center/right), mid-goal height. */
export function zone3DTarget(zone: number): [number, number, number] {
  return [COL_X[zone], ROW_Y[1], GOAL_Z + 0.15];
}

/**
 * Keeper dive target X for a given column (0=left, 1=center, 2=right).
 * A save puts the keeper at COL_X[col]; for center, pick the side randomly
 * based on the kick direction.
 */
export function keeperTargetX(col: number): number {
  return COL_X[col];
}
