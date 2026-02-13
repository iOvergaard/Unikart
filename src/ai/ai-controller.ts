import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { DifficultyProfile } from './difficulty';
import { AiTendency } from '../config/characters';
import { ItemSystem } from '../gameplay/item-system';
import { ButterflySystem } from '../gameplay/butterfly-system';

export interface AiInput {
  accel: number;    // -1..1
  steer: number;    // -1..1
  drift: boolean;
  useItem: boolean;
}

// Reusable vector to avoid allocations in hot paths
const _v = new THREE.Vector3();

/**
 * AI controller for a single CPU kart.
 * Follows the track spline with lane offsets, drifts on curves, uses items.
 * Avoids going off-road, overtakes opponents, and seeks collectibles.
 */
export class AiController {
  private kart: Kart;
  private track: Track;
  private profile: DifficultyProfile;
  private tendency: AiTendency;
  private itemSystem: ItemSystem | null;
  private butterflySystem: ButterflySystem | null;

  // AI state
  private targetLaneOffset = 0;        // lateral offset from centerline
  private nextDecisionTime = 0;        // when to re-evaluate lane
  private isDrifting = false;
  private driftStartT = 0;
  private itemHoldTimer = 0;
  private laneBlend = 0;               // current blended offset

  // Randomness seeds per-kart for variety
  private seed: number;

  constructor(
    kart: Kart,
    track: Track,
    profile: DifficultyProfile,
    itemSystem?: ItemSystem,
    butterflySystem?: ButterflySystem,
  ) {
    this.kart = kart;
    this.track = track;
    this.profile = profile;
    this.tendency = kart.character.aiTendency;
    this.seed = kart.id * 137.5;
    this.itemSystem = itemSystem ?? null;
    this.butterflySystem = butterflySystem ?? null;

    // Start with a lane offset based on grid position so AI karts don't all
    // converge on the centerline immediately and pile up at the start.
    const row = Math.floor(kart.id / 2);
    const col = (kart.id % 2) === 0 ? -1 : 1;
    this.targetLaneOffset = col * 3;
    this.laneBlend = this.targetLaneOffset;
    // Delay the first lane decision so they hold their grid lane briefly
    this.nextDecisionTime = 2 + row * 0.3;
  }

  /** Produce input for this frame */
  update(dt: number, allKarts: Kart[], raceTime: number): AiInput {
    const input: AiInput = { accel: 1, steer: 0, drift: false, useItem: false };

    // Stunned — just accelerate straight (difficulty affects recovery)
    if (this.kart.gustTimer > 0) {
      input.accel = this.profile.stunRecovery;
      return input;
    }

    const t = this.track.spline.closestT(this.kart.position);
    // Look further ahead at higher speeds for smoother driving
    const speedRatio = Math.abs(this.kart.speed) / this.kart.maxSpeed;
    const lookAhead = 0.04 + 0.04 * speedRatio; // 4-8% of track
    const targetT = (t + lookAhead) % 1;

    // ── Lane selection (every ~0.5s) ──
    if (raceTime >= this.nextDecisionTime) {
      this.nextDecisionTime = raceTime + 0.3 + this.pseudoRandom() * 0.4;
      this.chooseLane(t, allKarts);
    }

    // Blend toward target lane
    this.laneBlend += (this.targetLaneOffset - this.laneBlend) * dt * 2;

    // ── Off-road correction: pull toward center and slow down ──
    if (!this.track.isOnRoad(this.kart.position)) {
      this.laneBlend *= 0.3;
      input.accel *= 0.6;
    }

    // ── Steering toward target point ──
    const targetPos = this.track.spline.getPoint(targetT);
    const right = this.track.spline.getRight(targetT);
    targetPos.add(right.clone().multiplyScalar(this.laneBlend));

    const toTarget = new THREE.Vector3().subVectors(targetPos, this.kart.position);
    toTarget.y = 0;

    const fwd = this.kart.forward;
    const cross = fwd.x * toTarget.z - fwd.z * toTarget.x;

    // Steer toward target — sharper response at higher difficulty
    const steerGain = 2.5 + this.profile.speedMult;
    input.steer = Math.max(-1, Math.min(1, -cross * steerGain));

    // ── Drift decision ──
    const turnSharpness = Math.abs(input.steer);
    const shouldDrift = turnSharpness > 0.35
      && this.kart.speed > 12
      && this.pseudoRandom() < this.profile.driftFrequency;

    if (shouldDrift && !this.isDrifting && !this.kart.drift.isCharging) {
      this.isDrifting = true;
      this.driftStartT = raceTime;
    }

    if (this.isDrifting) {
      input.drift = true;
      // Release drift at target tier using actual tier thresholds
      const chargeTime = raceTime - this.driftStartT;
      const tierTimes = [0, 0.38, 0.75, 1.1]; // slightly past actual thresholds [0.35, 0.7, 1.05]
      const targetTime = tierTimes[this.profile.maxDriftTier];
      if (chargeTime > targetTime || (turnSharpness < 0.1 && chargeTime > 0.38)) {
        input.drift = false;
        this.isDrifting = false;
      }
    }

    // ── Speed management ──
    // Soft speed cap — coast instead of braking, but let boosts exceed it
    const isBoosted = this.kart.drift.isBoosting || this.kart.turboTimer > 0;
    if (!isBoosted && this.kart.speed > this.kart.maxSpeed * this.profile.speedMult) {
      input.accel = 0;
    }

    // Apply difficulty acceleration multiplier
    input.accel *= this.profile.accelMult;

    // ── Item usage ──
    if (this.kart.heldItem) {
      this.itemHoldTimer += dt;
      if (this.itemHoldTimer >= this.profile.itemReactionTime) {
        input.useItem = true;
        this.itemHoldTimer = 0;
      }
    } else {
      this.itemHoldTimer = 0;
    }

    return input;
  }

  private chooseLane(currentT: number, allKarts: Kart[]): void {
    const baseVariation = this.profile.lineVariation;
    const fwd = this.kart.forward;

    // ── Overtake: find the kart directly ahead and pick a passing side ──
    let overtakeOffset: number | null = null;
    const kartAhead = this.findKartAhead(allKarts);
    if (kartAhead && this.pseudoRandom() < this.profile.overtakeChance) {
      const otherLateral = this.track.spline.lateralOffset(kartAhead.position);
      // Pass on the opposite side, with a 2-unit clearance
      const passingSide = otherLateral > 0 ? -1 : 1;
      overtakeOffset = passingSide * (Math.abs(otherLateral) + 2);
    }

    // ── Collectible seeking: bias toward nearby butterflies / item boxes ──
    const collectibleOffset = this.findCollectibleBias();

    // ── Combine: overtake > collectible > tendency-based default ──
    if (overtakeOffset !== null) {
      this.targetLaneOffset = overtakeOffset;
    } else if (collectibleOffset !== null) {
      this.targetLaneOffset = collectibleOffset;
    } else {
      // Tendency-based lane choice (original logic)
      switch (this.tendency) {
        case 'aggressive':
          this.targetLaneOffset = -baseVariation * 0.5 + this.pseudoRandom() * baseVariation * 0.3;
          break;
        case 'defensive':
          this.targetLaneOffset = baseVariation * 0.5 + this.pseudoRandom() * baseVariation * 0.3;
          break;
        case 'drift-happy':
          this.targetLaneOffset = (this.pseudoRandom() - 0.5) * baseVariation * 1.5;
          break;
        case 'pusher': {
          const hasNearby = allKarts.some(
            k => k.id !== this.kart.id && this.kart.position.distanceTo(k.position) < 15,
          );
          this.targetLaneOffset = hasNearby
            ? 0
            : (this.pseudoRandom() - 0.5) * baseVariation;
          break;
        }
        default:
          this.targetLaneOffset = (this.pseudoRandom() - 0.5) * baseVariation;
          break;
      }
    }

    // ── Side awareness: nudge away from karts beside us ──
    for (const other of allKarts) {
      if (other.id === this.kart.id) continue;
      const dx = other.position.x - this.kart.position.x;
      const dz = other.position.z - this.kart.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 8 || dist < 0.1) continue;

      // Skip if mostly ahead or behind (not beside)
      const aheadDot = fwd.x * dx + fwd.z * dz;
      if (Math.abs(aheadDot) > dist * 0.7) continue;

      // Which side are they on? (positive cross = left of our forward)
      const sideCross = fwd.x * dz - fwd.z * dx;
      // Push our offset away from them (stronger when closer)
      const push = 1.5 * (1 - dist / 8);
      // sideCross > 0 = other is to our left → push right (positive offset)
      this.targetLaneOffset += sideCross > 0 ? push : -push;
    }

    // ── Off-road clamping: verify chosen offset is on the road ──
    const checkT = (currentT + 0.05) % 1;
    const checkCenter = this.track.spline.getPoint(checkT);
    const checkRight = this.track.spline.getRight(checkT);

    _v.copy(checkCenter).addScaledVector(checkRight, this.targetLaneOffset);
    _v.y = 0;
    if (!this.track.isOnRoad(_v)) {
      // Halve the offset and retry
      this.targetLaneOffset *= 0.5;
      _v.copy(checkCenter).addScaledVector(checkRight, this.targetLaneOffset);
      _v.y = 0;
      if (!this.track.isOnRoad(_v)) {
        this.targetLaneOffset = 0;
      }
    }
  }

  /** Find the nearest opponent ahead of us (within 20 units, mostly in our forward direction) */
  private findKartAhead(allKarts: Kart[]): Kart | null {
    let nearest: Kart | null = null;
    let nearestDist = 20;
    const fwd = this.kart.forward;

    for (const other of allKarts) {
      if (other.id === this.kart.id) continue;
      const dx = other.position.x - this.kart.position.x;
      const dz = other.position.z - this.kart.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= nearestDist) continue;

      // Must be mostly ahead (forward projection > 30% of distance)
      const aheadDot = fwd.x * dx + fwd.z * dz;
      if (aheadDot < dist * 0.3) continue;

      nearestDist = dist;
      nearest = other;
    }
    return nearest;
  }

  /**
   * Bias toward the nearest collectible ahead of us.
   * item-focused tendency seeks hardest; scaled by difficulty.
   */
  private findCollectibleBias(): number | null {
    let seekStrength = 0.3;
    if (this.tendency === 'item-focused') seekStrength = 0.8;
    // Higher difficulty → more likely to seek
    seekStrength *= 0.5 + this.profile.speedMult * 0.5;

    if (this.pseudoRandom() > seekStrength) return null;

    const fwd = this.kart.forward;
    let bestTarget: THREE.Vector3 | null = null;
    let bestDist = 30; // max search radius

    // Seek item boxes when we don't have an item
    if (this.itemSystem && this.kart.heldItem === null) {
      for (const box of this.itemSystem.boxes) {
        if (!box.active) continue;
        const dx = box.position.x - this.kart.position.x;
        const dz = box.position.z - this.kart.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist >= bestDist) continue;
        // Must be ahead
        if (fwd.x * dx + fwd.z * dz < 2) continue;
        bestDist = dist;
        bestTarget = box.position;
      }
    }

    // Seek butterflies
    if (this.butterflySystem) {
      for (const b of this.butterflySystem.butterflies) {
        if (b.collected) continue;
        const dx = b.position.x - this.kart.position.x;
        const dz = b.position.z - this.kart.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist >= bestDist) continue;
        if (fwd.x * dx + fwd.z * dz < 2) continue;
        bestDist = dist;
        bestTarget = b.position;
      }
    }

    if (!bestTarget) return null;
    return this.track.spline.lateralOffset(bestTarget);
  }

  /** Simple seeded pseudo-random (LCG) for consistent AI variety */
  private pseudoRandom(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0x7fffffff;
    return (this.seed / 0x7fffffff);
  }
}
