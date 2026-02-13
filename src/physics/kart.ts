import * as THREE from 'three';
import { DriftBoost } from './drift-boost';
import { CharacterDef } from '../config/characters';
import { ItemId } from '../config/items';
import {
  BASE_MAX_SPEED, BASE_ACCELERATION, BASE_BRAKE_FORCE,
  BASE_STEERING_SPEED, BASE_FRICTION, BASE_WEIGHT,
  OFFROAD_SPEED_MULTIPLIER, OFFROAD_DURING_BOOST_MULTIPLIER,
  DRIFT_STEERING_MULTIPLIER, DRIFT_FRICTION_MULTIPLIER,
  KART_COLLISION_RADIUS,
} from '../config/constants';

export class Kart {
  // Identity
  readonly id: number;
  readonly character: CharacterDef;
  readonly isHuman: boolean;

  // Transform
  position = new THREE.Vector3();
  rotation = 0;  // y-axis heading in radians
  velocity = new THREE.Vector3();

  // Derived stats (from character)
  maxSpeed: number;
  baseMaxSpeed: number;
  acceleration: number;
  steeringSpeed: number;
  weight: number;

  // State
  speed = 0;
  steerAngle = 0;
  isOnRoad = true;
  drift: DriftBoost;

  // Item state
  heldItem: ItemId | null = null;

  // Effect state (from being hit)
  gustTimer = 0;      // steering locked
  wobbleTimer = 0;    // speed reduced
  turboTimer = 0;     // external boost
  spinAngle = 0;      // visual spin from gust

  // Butterfly collection
  butterflies = 0;

  // Race state
  lap = 0;
  checkpoint = 0;     // progress parameter [0..1] along spline
  lastCheckpoint = 0;
  raceProgress = 0;   // lap + checkpoint for position sorting
  finished = false;
  finishTime = 0;
  lapTimes: number[] = [];
  private lapStartTime = 0;

  // 3D model reference
  mesh: THREE.Object3D | null = null;

  // Collision
  readonly collisionRadius = KART_COLLISION_RADIUS;

  constructor(id: number, character: CharacterDef, isHuman: boolean) {
    this.id = id;
    this.character = character;
    this.isHuman = isHuman;
    this.drift = new DriftBoost();

    // Convert 1-6 stat scale to physics values
    const s = character;
    this.maxSpeed = BASE_MAX_SPEED * (0.7 + s.speed * 0.1);        // 35..105% range
    this.baseMaxSpeed = this.maxSpeed;
    this.acceleration = BASE_ACCELERATION * (0.7 + s.accel * 0.1);
    this.steeringSpeed = BASE_STEERING_SPEED * (0.7 + s.handling * 0.1);
    this.weight = BASE_WEIGHT * (0.7 + s.weight * 0.1);
  }

  /** Get the forward direction vector */
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
  }

  /** Apply physics for one fixed timestep */
  updatePhysics(dt: number, accelInput: number, steerInput: number, driftHeld: boolean, onRoad: boolean, inDriftZone: boolean): void {
    this.isOnRoad = onRoad;

    // ── Effect timers ──
    if (this.gustTimer > 0) {
      this.gustTimer -= dt;
      steerInput = 0; // steering locked
      accelInput *= 0.3;
      this.spinAngle += 12 * dt; // visual spin
    }
    if (this.wobbleTimer > 0) {
      this.wobbleTimer -= dt;
      // Speed reduction handled via effective max speed
    }

    // ── Drift system ──
    if (driftHeld && !this.drift.isCharging && !this.drift.isBoosting && this.speed > 5) {
      this.drift.startDrift(steerInput);
    }
    if (!driftHeld && this.drift.isCharging) {
      this.drift.release();
    }
    this.drift.update(dt, inDriftZone);

    // ── Steering ──
    let steerRate = this.steeringSpeed;
    if (this.drift.isCharging) {
      steerRate *= DRIFT_STEERING_MULTIPLIER;
      // Bias steering toward drift direction
      steerInput = steerInput * 0.6 + this.drift.driftDirection * 0.4;
    }
    this.steerAngle = steerInput * steerRate;

    // Apply steering only when moving
    if (Math.abs(this.speed) > 0.5) {
      this.rotation += this.steerAngle * dt * (this.speed > 0 ? 1 : -0.5);
    }

    // ── Acceleration ──
    const effectiveMaxSpeed = this.getEffectiveMaxSpeed(onRoad);
    if (accelInput > 0) {
      this.speed += this.acceleration * accelInput * dt;
    } else if (accelInput < 0) {
      this.speed -= BASE_BRAKE_FORCE * dt;
    }

    // ── Friction ──
    let friction = BASE_FRICTION;
    if (this.drift.isCharging) friction *= DRIFT_FRICTION_MULTIPLIER;
    this.speed *= Math.pow(friction, dt * 60); // frame-rate independent

    // Clamp speed
    this.speed = Math.max(-effectiveMaxSpeed * 0.3, Math.min(effectiveMaxSpeed, this.speed));

    // ── Velocity ──
    const fwd = this.forward;
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // Keep on ground plane
    this.position.y = 0;
  }

  private getEffectiveMaxSpeed(onRoad: boolean): number {
    let max = this.maxSpeed;

    // Drift boost
    max *= this.drift.speedMultiplier;

    // Turbo item boost
    if (this.turboTimer > 0) {
      max *= 1.35;
    }

    // Wobble debuff
    if (this.wobbleTimer > 0) {
      max *= 0.5;
    }

    // Off-road penalty
    if (!onRoad) {
      if (this.drift.isBoosting || this.turboTimer > 0) {
        max *= OFFROAD_DURING_BOOST_MULTIPLIER;
      } else {
        max *= OFFROAD_SPEED_MULTIPLIER;
      }
    }

    return max;
  }

  /** Update race progress (call after physics) */
  updateProgress(splineT: number, raceTime: number): void {
    this.lastCheckpoint = this.checkpoint;
    this.checkpoint = splineT;

    // Detect lap completion (crossed from ~1.0 back to ~0.0)
    if (this.lastCheckpoint > 0.9 && this.checkpoint < 0.1 && !this.finished) {
      this.lap++;
      this.lapTimes.push(raceTime - this.lapStartTime);
      this.lapStartTime = raceTime;
    }

    // Detect wrong way (crossed from ~0.0 back to ~1.0)
    if (this.lastCheckpoint < 0.1 && this.checkpoint > 0.9 && this.lap > 0) {
      this.lap--;
      this.lapTimes.pop();
    }

    this.raceProgress = this.lap + this.checkpoint;
  }

  /** Place kart at a grid position for race start */
  placeOnGrid(position: THREE.Vector3, heading: number, splineT: number): void {
    this.position.copy(position);
    this.rotation = heading;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.lap = 0;
    this.checkpoint = splineT;
    this.lastCheckpoint = splineT;
    this.raceProgress = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.heldItem = null;
    this.butterflies = 0;
    this.gustTimer = 0;
    this.wobbleTimer = 0;
    this.turboTimer = 0;
    this.drift = new DriftBoost();
  }
}
