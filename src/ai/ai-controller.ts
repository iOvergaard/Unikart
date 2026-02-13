import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { DifficultyProfile } from './difficulty';
import { AiTendency } from '../config/characters';

export interface AiInput {
  accel: number;    // -1..1
  steer: number;    // -1..1
  drift: boolean;
  useItem: boolean;
}

/**
 * AI controller for a single CPU kart.
 * Follows the track spline with lane offsets, drifts on curves, uses items.
 */
export class AiController {
  private kart: Kart;
  private track: Track;
  private profile: DifficultyProfile;
  private tendency: AiTendency;

  // AI state
  private targetLaneOffset = 0;        // lateral offset from centerline
  private nextDecisionTime = 0;        // when to re-evaluate lane
  private isDrifting = false;
  private driftStartT = 0;
  private itemHoldTimer = 0;
  private laneBlend = 0;               // current blended offset

  // Randomness seeds per-kart for variety
  private seed: number;

  constructor(kart: Kart, track: Track, profile: DifficultyProfile) {
    this.kart = kart;
    this.track = track;
    this.profile = profile;
    this.tendency = kart.character.aiTendency;
    this.seed = kart.id * 137.5;
  }

  /** Produce input for this frame */
  update(dt: number, allKarts: Kart[], raceTime: number): AiInput {
    const input: AiInput = { accel: 1, steer: 0, drift: false, useItem: false };

    // Stunned — just accelerate straight
    if (this.kart.gustTimer > 0) return input;

    const t = this.track.spline.closestT(this.kart.position);
    const lookAhead = 0.05; // look 5% of track ahead
    const targetT = (t + lookAhead) % 1;

    // ── Lane selection (every ~0.5s) ──
    if (raceTime >= this.nextDecisionTime) {
      this.nextDecisionTime = raceTime + 0.3 + this.pseudoRandom() * 0.4;
      this.chooseLane(t, allKarts);
    }

    // Blend toward target lane
    this.laneBlend += (this.targetLaneOffset - this.laneBlend) * dt * 2;

    // ── Steering toward target point ──
    const targetPos = this.track.spline.getPoint(targetT);
    const right = this.track.spline.getRight(targetT);
    targetPos.add(right.clone().multiplyScalar(this.laneBlend));

    const toTarget = new THREE.Vector3().subVectors(targetPos, this.kart.position);
    toTarget.y = 0;

    const fwd = this.kart.forward;
    const cross = fwd.x * toTarget.z - fwd.z * toTarget.x;
    const dot = fwd.dot(toTarget.normalize());

    // Steer toward target
    input.steer = Math.max(-1, Math.min(1, -cross * 3));

    // ── Drift decision ──
    const turnSharpness = Math.abs(input.steer);
    const shouldDrift = turnSharpness > 0.4
      && this.kart.speed > 15
      && this.pseudoRandom() < this.profile.driftFrequency;

    if (shouldDrift && !this.isDrifting && !this.kart.drift.isCharging) {
      this.isDrifting = true;
      this.driftStartT = raceTime;
    }

    if (this.isDrifting) {
      input.drift = true;
      // Release drift at appropriate tier
      const chargeTime = raceTime - this.driftStartT;
      const maxTierTime = [0, 0.4, 0.8, 1.2][this.profile.maxDriftTier];
      if (chargeTime > maxTierTime || turnSharpness < 0.15) {
        input.drift = false;
        this.isDrifting = false;
      }
    }

    // ── Speed management ──
    // Slow down for tight turns
    if (turnSharpness > 0.6 && this.kart.speed > this.kart.maxSpeed * 0.7) {
      input.accel = 0.5;
    }

    // Apply difficulty speed cap
    if (this.kart.speed > this.kart.maxSpeed * this.profile.speedMult) {
      input.accel = 0.3;
    }

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

    // Check for nearby opponents to decide lane
    let nearbyOpponents = 0;
    for (const other of allKarts) {
      if (other.id === this.kart.id) continue;
      const dist = this.kart.position.distanceTo(other.position);
      if (dist < 15) nearbyOpponents++;
    }

    // Tendency-based lane choice
    switch (this.tendency) {
      case 'aggressive':
        // Inside line (shorter path)
        this.targetLaneOffset = -baseVariation * 0.5 + this.pseudoRandom() * baseVariation * 0.3;
        break;
      case 'defensive':
        // Outside line (safer)
        this.targetLaneOffset = baseVariation * 0.5 + this.pseudoRandom() * baseVariation * 0.3;
        break;
      case 'drift-happy':
        // Wide entry for drifting
        this.targetLaneOffset = (this.pseudoRandom() - 0.5) * baseVariation * 1.5;
        break;
      case 'pusher':
        // Seek opponent lane to bump
        if (nearbyOpponents > 0) {
          this.targetLaneOffset = 0; // center, most likely to bump
        } else {
          this.targetLaneOffset = (this.pseudoRandom() - 0.5) * baseVariation;
        }
        break;
      default:
        // smooth, balanced, item-focused: moderate variation
        this.targetLaneOffset = (this.pseudoRandom() - 0.5) * baseVariation;
        break;
    }
  }

  /** Simple seeded pseudo-random (LCG) for consistent AI variety */
  private pseudoRandom(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0x7fffffff;
    return (this.seed / 0x7fffffff);
  }
}
