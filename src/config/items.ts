import {
  ITEM_GUST_STEER_LOCK,
  ITEM_WOBBLE_DURATION,
  ITEM_WOBBLE_SPEED_MULT,
  ITEM_TURBO_DURATION,
  ITEM_TURBO_MULTIPLIER,
} from './constants';

export type ItemId = 'gust' | 'wobble' | 'turbo';

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  /** 'self' = affects user, 'target' = hits nearest opponent ahead */
  target: 'self' | 'target';
  /** Position weight: higher = more likely for back-of-pack */
  backWeight: number;
}

export const ITEMS: ItemDef[] = [
  {
    id: 'gust',
    name: 'Gust Spin',
    description: 'Sends a gust that spins out a racer ahead!',
    target: 'target',
    backWeight: 1,
  },
  {
    id: 'wobble',
    name: 'Wobble',
    description: 'Makes a racer ahead go wobbly and slow!',
    target: 'target',
    backWeight: 2,
  },
  {
    id: 'turbo',
    name: 'Turbo Gift',
    description: 'Instant speed boost — zoom!',
    target: 'self',
    backWeight: 3,
  },
];

/** Roll a random item weighted by racer position (0 = 1st, 7 = last) */
export function rollItem(position: number): ItemDef {
  // Position 0 (1st) → low weight bonus, Position 7 (last) → high weight bonus
  const positionFactor = position / 7; // 0..1

  const weights = ITEMS.map(item => {
    // Back-of-pack gets more backWeight bonus
    return 1 + item.backWeight * positionFactor * 2;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < ITEMS.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ITEMS[i];
  }
  return ITEMS[0];
}

/** Effect parameters by item type */
export const ITEM_EFFECTS = {
  gust: {
    steerLockDuration: ITEM_GUST_STEER_LOCK,
    spinSpeed: 12, // radians/sec visual spin
  },
  wobble: {
    duration: ITEM_WOBBLE_DURATION,
    speedMultiplier: ITEM_WOBBLE_SPEED_MULT,
  },
  turbo: {
    duration: ITEM_TURBO_DURATION,
    speedMultiplier: ITEM_TURBO_MULTIPLIER,
  },
} as const;
