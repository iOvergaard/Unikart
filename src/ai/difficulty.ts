import { Difficulty } from '../core/game-state';

export interface DifficultyProfile {
  /** Multiplier on effective max speed (0.85 = 85% of base) */
  speedMult: number;
  /** Multiplier on acceleration */
  accelMult: number;
  /** Max drift tier AI will attempt */
  maxDriftTier: number;
  /** How often AI attempts to drift [0..1] — 1 = every eligible turn */
  driftFrequency: number;
  /** Reaction time for item usage (seconds after getting item) */
  itemReactionTime: number;
  /** How much lateral variation in racing line (meters) */
  lineVariation: number;
  /** Probability of attempting overtake when opportunity arises */
  overtakeChance: number;
  /** Speed retained when recovering from stun (0..1) */
  stunRecovery: number;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  chill: {
    speedMult: 0.82,
    accelMult: 0.8,
    maxDriftTier: 2,
    driftFrequency: 0.3,
    itemReactionTime: 2.0,
    lineVariation: 3.0,
    overtakeChance: 0.2,
    stunRecovery: 0.6,
  },
  standard: {
    speedMult: 0.95,
    accelMult: 1.0,
    maxDriftTier: 3,
    driftFrequency: 0.6,
    itemReactionTime: 1.0,
    lineVariation: 1.5,
    overtakeChance: 0.5,
    stunRecovery: 0.8,
  },
  mean: {
    speedMult: 1.1,
    accelMult: 1.15,
    maxDriftTier: 3,
    driftFrequency: 0.95,
    itemReactionTime: 0.2,
    lineVariation: 0.4,
    overtakeChance: 0.9,
    stunRecovery: 0.95,
  },
};
