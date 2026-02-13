export interface GateDef {
  type: 'gate';
  /** Spline parameter [0..1] for placement */
  t: number;
  /** Which slot (0, 1, or 2) is the boost slot */
  boostSlot: number;
}

export interface HammerDef {
  type: 'hammer';
  /** Spline parameter [0..1] for placement */
  t: number;
}

export type ObstacleDef = GateDef | HammerDef;
