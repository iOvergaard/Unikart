import {
  DRIFT_TIER_THRESHOLDS,
  DRIFT_BOOST_DURATIONS,
  DRIFT_BOOST_MULTIPLIER,
  DRIFT_ZONE_CHARGE_MULTIPLIER,
  DRIFT_COOLDOWN,
} from '../config/constants';

export type DriftState = 'idle' | 'charging' | 'boosting' | 'cooldown';

export class DriftBoost {
  state: DriftState = 'idle';
  tier = 0;               // 0 = none, 1/2/3 = boost tiers
  chargeTime = 0;          // time spent charging
  boostTimeLeft = 0;       // remaining boost duration
  cooldownLeft = 0;        // cooldown before can drift again
  /** Direction of drift: -1 = left, 1 = right */
  driftDirection = 0;

  get isCharging(): boolean { return this.state === 'charging'; }
  get isBoosting(): boolean { return this.state === 'boosting'; }
  get speedMultiplier(): number {
    return this.state === 'boosting' ? DRIFT_BOOST_MULTIPLIER : 1;
  }

  startDrift(steerDir: number): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'charging';
    this.chargeTime = 0;
    this.tier = 0;
    this.driftDirection = steerDir >= 0 ? 1 : -1;
    return true;
  }

  update(dt: number, inDriftZone: boolean): void {
    switch (this.state) {
      case 'charging': {
        const multiplier = inDriftZone ? DRIFT_ZONE_CHARGE_MULTIPLIER : 1;
        this.chargeTime += dt * multiplier;

        // Check tier advancement
        if (this.chargeTime >= DRIFT_TIER_THRESHOLDS[2] && this.tier < 3) {
          this.tier = 3;
        } else if (this.chargeTime >= DRIFT_TIER_THRESHOLDS[1] && this.tier < 2) {
          this.tier = 2;
        } else if (this.chargeTime >= DRIFT_TIER_THRESHOLDS[0] && this.tier < 1) {
          this.tier = 1;
        }
        break;
      }

      case 'boosting': {
        this.boostTimeLeft -= dt;
        if (this.boostTimeLeft <= 0) {
          this.state = 'cooldown';
          this.cooldownLeft = DRIFT_COOLDOWN;
        }
        break;
      }

      case 'cooldown': {
        this.cooldownLeft -= dt;
        if (this.cooldownLeft <= 0) {
          this.state = 'idle';
        }
        break;
      }
    }
  }

  /** Release drift → start boost (returns boost duration) */
  release(): number {
    if (this.state !== 'charging') return 0;

    const duration = DRIFT_BOOST_DURATIONS[this.tier];
    if (duration > 0) {
      this.state = 'boosting';
      this.boostTimeLeft = duration;
    } else {
      this.state = 'cooldown';
      this.cooldownLeft = DRIFT_COOLDOWN;
    }
    this.driftDirection = 0;
    return duration;
  }

  /** Force-cancel drift (e.g. hit by item) */
  cancel(): void {
    this.state = 'cooldown';
    this.cooldownLeft = DRIFT_COOLDOWN;
    this.tier = 0;
    this.chargeTime = 0;
    this.driftDirection = 0;
  }
}
