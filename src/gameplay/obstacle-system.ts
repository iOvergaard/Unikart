import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { ObstacleDef, GateDef, HammerDef } from '../config/obstacles';
import {
  GATE_PILLAR_WIDTH, GATE_HIT_SPEED_FACTOR, GATE_HIT_PUSH_FORCE,
  GATE_BOOST_DURATION, GATE_COLLISION_DEPTH,
  HAMMER_HEAD_RADIUS, HAMMER_SWING_PERIOD, HAMMER_ARM_LENGTH,
  HAMMER_KNOCKBACK_SPEED, HAMMER_HIT_SPEED_FACTOR, HAMMER_STUN_DURATION,
  KART_COLLISION_RADIUS,
} from '../config/constants';

export interface GateObstacle {
  type: 'gate';
  def: GateDef;
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  roadWidth: number;
  /** Lateral offsets of the 4 pillar centers relative to road center */
  pillarOffsets: number[];
  /** Lateral centers of the 3 slots */
  slotCenters: number[];
  slotWidth: number;
  /** Which slot is currently the boost slot (changes over time) */
  boostSlot: number;
  /** Countdown until next random switch */
  switchTimer: number;
}

export interface HammerObstacle {
  type: 'hammer';
  def: HammerDef;
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  roadWidth: number;
  swingRadius: number;
}

export type Obstacle = GateObstacle | HammerObstacle;

export interface ObstacleEvent {
  kartId: number;
  obstacleType: 'gate-pillar' | 'gate-boost' | 'hammer';
  message: string;
}

const GATE_HIT_COOLDOWN = 1.0;
const HAMMER_HIT_COOLDOWN = 1.5;
const GATE_SWITCH_INTERVAL = 4; // seconds between boost slot switches

export class ObstacleSystem {
  obstacles: Obstacle[] = [];
  private events: ObstacleEvent[] = [];
  /** Per kart-obstacle pair cooldown: key = `${kartId}-${obstacleIndex}` */
  private cooldowns = new Map<string, number>();

  constructor(track: Track, defs: ObstacleDef[]) {
    for (const def of defs) {
      const center = track.spline.getPoint(def.t);
      const tangent = track.spline.getTangent(def.t);
      const right = track.spline.getRight(def.t);
      // Approximate road width at this t (use track's isOnRoad check distance)
      const roadWidth = this.measureRoadWidth(track, def.t, center, right);

      if (def.type === 'gate') {
        const halfWidth = roadWidth / 2;
        // 4 pillars evenly divide the road into 3 slots
        const pillarOffsets: number[] = [];
        for (let i = 0; i < 4; i++) {
          pillarOffsets.push(-halfWidth + (i / 3) * roadWidth);
        }
        const slotWidth = roadWidth / 3;
        const slotCenters = [
          pillarOffsets[0] + slotWidth / 2,
          pillarOffsets[1] + slotWidth / 2,
          pillarOffsets[2] + slotWidth / 2,
        ];

        this.obstacles.push({
          type: 'gate',
          def,
          center, tangent, right, roadWidth,
          pillarOffsets, slotCenters, slotWidth,
          boostSlot: def.boostSlot,
          switchTimer: GATE_SWITCH_INTERVAL,
        });
      } else {
        // Swing radius matches the arm half-length so visual and collision align
        const swingRadius = HAMMER_ARM_LENGTH / 2;
        this.obstacles.push({
          type: 'hammer',
          def,
          center, tangent, right, roadWidth,
          swingRadius,
        });
      }
    }
  }

  update(dt: number, karts: Kart[], raceTime: number): void {
    // Tick cooldowns
    for (const [key, time] of this.cooldowns) {
      const newTime = time - dt;
      if (newTime <= 0) {
        this.cooldowns.delete(key);
      } else {
        this.cooldowns.set(key, newTime);
      }
    }

    // Switch gate boost slots on timer
    for (const obs of this.obstacles) {
      if (obs.type === 'gate') {
        obs.switchTimer -= dt;
        if (obs.switchTimer <= 0) {
          // Pick a different slot
          let next = Math.floor(Math.random() * 3);
          if (next === obs.boostSlot) next = (next + 1) % 3;
          obs.boostSlot = next;
          obs.switchTimer = GATE_SWITCH_INTERVAL;
        }
      }
    }

    for (let oi = 0; oi < this.obstacles.length; oi++) {
      const obs = this.obstacles[oi];
      for (const kart of karts) {
        const cooldownKey = `${kart.id}-${oi}`;
        if (this.cooldowns.has(cooldownKey)) continue;

        if (obs.type === 'gate') {
          this.checkGateCollision(kart, obs, oi);
        } else {
          this.checkHammerCollision(kart, obs, oi, raceTime);
        }
      }
    }
  }

  drainEvents(): ObstacleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private checkGateCollision(kart: Kart, gate: GateObstacle, obstacleIndex: number): void {
    const toKart = new THREE.Vector3().subVectors(kart.position, gate.center);

    // Along-track depth check
    const alongTrack = toKart.dot(gate.tangent);
    if (Math.abs(alongTrack) > GATE_COLLISION_DEPTH + KART_COLLISION_RADIUS) return;

    // Lateral offset
    const lateral = toKart.dot(gate.right);

    // Check pillar hits (only pillar half-width, no kart radius — keeps slots passable)
    for (const pillarOffset of gate.pillarOffsets) {
      const dist = Math.abs(lateral - pillarOffset);
      if (dist < GATE_PILLAR_WIDTH / 2) {
        // Pillar hit!
        this.cooldowns.set(`${kart.id}-${obstacleIndex}`, GATE_HIT_COOLDOWN);
        kart.speed *= GATE_HIT_SPEED_FACTOR;
        // Push back along tangent direction (away from gate)
        const pushDir = alongTrack > 0 ? 1 : -1;
        kart.position.add(gate.tangent.clone().multiplyScalar(pushDir * GATE_HIT_PUSH_FORCE * 0.1));
        kart.speed *= -0.3; // slight bounce
        kart.drift.cancel();
        this.events.push({
          kartId: kart.id,
          obstacleType: 'gate-pillar',
          message: '💥 Bonk!',
        });
        return;
      }
    }

    // If not hitting a pillar but within gate depth, check slot
    if (Math.abs(alongTrack) < GATE_COLLISION_DEPTH) {
      const halfWidth = gate.roadWidth / 2;
      if (Math.abs(lateral) < halfWidth) {
        // Determine which slot
        const normalizedLateral = lateral + halfWidth;
        const slotIndex = Math.floor(normalizedLateral / gate.slotWidth);
        const clampedSlot = Math.max(0, Math.min(2, slotIndex));

        if (clampedSlot === gate.boostSlot) {
          // Boost!
          this.cooldowns.set(`${kart.id}-${obstacleIndex}`, GATE_HIT_COOLDOWN);
          kart.turboTimer = Math.max(kart.turboTimer, GATE_BOOST_DURATION);
          this.events.push({
            kartId: kart.id,
            obstacleType: 'gate-boost',
            message: '✨ Speed boost!',
          });
        }
      }
    }
  }

  private checkHammerCollision(kart: Kart, hammer: HammerObstacle, obstacleIndex: number, raceTime: number): void {
    // Compute hammer head world position (must match visual in scene-manager)
    const timeAngle = (raceTime / HAMMER_SWING_PERIOD) * Math.PI * 2;
    const rotationY = Math.sin(timeAngle) * (Math.PI / 2);
    const swingOffset = Math.sin(rotationY) * hammer.swingRadius;
    const headPos = hammer.center.clone()
      .add(hammer.right.clone().multiplyScalar(swingOffset));
    headPos.y = 0; // ground plane check

    // 2D distance check (XZ plane)
    const dx = kart.position.x - headPos.x;
    const dz = kart.position.z - headPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < HAMMER_HEAD_RADIUS + KART_COLLISION_RADIUS) {
      // Hit!
      this.cooldowns.set(`${kart.id}-${obstacleIndex}`, HAMMER_HIT_COOLDOWN);
      kart.speed *= HAMMER_HIT_SPEED_FACTOR;
      kart.drift.cancel();
      kart.hammerStunTimer = HAMMER_STUN_DURATION;

      // Knockback in swing direction (derivative of sin → cos)
      const swingVelocitySign = Math.cos(rotationY) * Math.cos(timeAngle);
      const knockbackDir = hammer.right.clone().multiplyScalar(swingVelocitySign > 0 ? 1 : -1);
      kart.knockbackVelocity.copy(knockbackDir.multiplyScalar(HAMMER_KNOCKBACK_SPEED));

      this.events.push({
        kartId: kart.id,
        obstacleType: 'hammer',
        message: '🔨 Ouch!',
      });
    }
  }

  private measureRoadWidth(track: Track, _t: number, center: THREE.Vector3, right: THREE.Vector3): number {
    // Binary search for road edge from center
    let lo = 0, hi = 30;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      const testPos = center.clone().add(right.clone().multiplyScalar(mid));
      if (track.isOnRoad(testPos)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo * 2; // symmetric
  }
}
