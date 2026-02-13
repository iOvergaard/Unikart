import * as THREE from 'three';
import { Kart } from './kart';
import { Track } from '../track/track';
import { WALL_BOUNCE_FACTOR, WALL_PUSH_FORCE, KART_BOUNCE_FACTOR } from '../config/constants';

const _tmpVec = new THREE.Vector3();

const GRACE_PERIOD = 2; // seconds after race start with no kart-kart collisions

/** Handle all collisions for a frame */
export function resolveCollisions(karts: Kart[], track: Track, raceTime = Infinity): void {
  // ── Kart vs Track barriers ──
  for (const kart of karts) {
    const push = track.getBarrierPush(kart.position);
    if (push) {
      // Gentle push back onto road
      kart.position.add(push.clone().multiplyScalar(WALL_PUSH_FORCE * 0.016));
      // Reduce speed on glancing hit (forgiving)
      const dot = Math.abs(kart.forward.dot(push));
      const speedLoss = dot * (1 - WALL_BOUNCE_FACTOR);
      kart.speed *= (1 - speedLoss);
      // Slight bounce in velocity direction
      kart.speed = Math.max(kart.speed, 3); // Never stop dead
    }
  }

  // ── Kart vs Kart (skip during grace period) ──
  if (raceTime < GRACE_PERIOD) return;

  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      _tmpVec.subVectors(b.position, a.position);
      _tmpVec.y = 0; // ignore height

      const dist = _tmpVec.length();
      const minDist = a.collisionRadius + b.collisionRadius;

      if (dist < minDist && dist > 0.01) {
        // Separate karts
        const overlap = minDist - dist;
        const normal = _tmpVec.normalize();

        // Weight-based separation: heavier kart moves less
        const totalWeight = a.weight + b.weight;
        const aRatio = b.weight / totalWeight;
        const bRatio = a.weight / totalWeight;

        a.position.add(normal.clone().multiplyScalar(-overlap * aRatio));
        b.position.add(normal.clone().multiplyScalar(overlap * bRatio));

        // Speed exchange (gentle bump)
        const relSpeed = a.speed - b.speed;
        a.speed -= relSpeed * KART_BOUNCE_FACTOR * aRatio;
        b.speed += relSpeed * KART_BOUNCE_FACTOR * bRatio;

        // Ensure minimum speed (never stop from a bump)
        a.speed = Math.max(a.speed, 2);
        b.speed = Math.max(b.speed, 2);
      }
    }
  }
}
