import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';

const COLLECTION_RADIUS = 3;
const CLUSTER_COUNT = 15;         // initial clusters
const BUTTERFLIES_PER_CLUSTER = 4;
const SPAWN_INTERVAL_MIN = 1.5;   // seconds
const SPAWN_INTERVAL_MAX = 3;

export interface ButterflyInstance {
  id: number;
  position: THREE.Vector3;
  collected: boolean;
}

export class ButterflySystem {
  butterflies: ButterflyInstance[] = [];
  private nextId = 0;
  private spawnTimer = 0;
  private nextSpawnAt = 0;

  constructor(track: Track) {
    // Spawn initial clusters spread along the road
    for (let i = 0; i < CLUSTER_COUNT; i++) {
      const t = (i + 0.5) / CLUSTER_COUNT; // evenly spaced around spline
      this.spawnCluster(track, t);
    }
    this.nextSpawnAt = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
  }

  /** Update: check collections + periodic spawning */
  update(dt: number, karts: Kart[], track: Track): void {
    // Check kart-butterfly collection
    for (const kart of karts) {
      for (const b of this.butterflies) {
        if (b.collected) continue;
        const dx = kart.position.x - b.position.x;
        const dz = kart.position.z - b.position.z;
        if (dx * dx + dz * dz < COLLECTION_RADIUS * COLLECTION_RADIUS) {
          b.collected = true;
          kart.butterflies++;
        }
      }
    }

    // Periodic spawning
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnAt) {
      this.spawnTimer = 0;
      this.nextSpawnAt = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
      const t = Math.random();
      this.spawnCluster(track, t);
    }
  }

  /** Get list of newly collected butterfly IDs and clear their flag for scene removal */
  drainCollected(): number[] {
    const ids: number[] = [];
    this.butterflies = this.butterflies.filter(b => {
      if (b.collected) { ids.push(b.id); return false; }
      return true;
    });
    return ids;
  }

  /** Get butterflies added since last drain (for scene to add meshes) */
  getNewButterflies(knownCount: number): ButterflyInstance[] {
    return this.butterflies.slice(knownCount);
  }

  private spawnCluster(track: Track, t: number): void {
    const center = track.spline.getPoint(t);
    const right = track.spline.getRight(t);

    for (let i = 0; i < BUTTERFLIES_PER_CLUSTER; i++) {
      const offset = (Math.random() - 0.5) * 10; // spread across road
      const along = (Math.random() - 0.5) * 4;   // slight forward/back spread
      const tangent = track.spline.getTangent(t);

      const pos = center.clone()
        .add(right.clone().multiplyScalar(offset))
        .add(tangent.clone().multiplyScalar(along));
      pos.y = 1.5;

      this.butterflies.push({
        id: this.nextId++,
        position: pos,
        collected: false,
      });
    }
  }
}

/** Race position bonus for scoring */
const POSITION_BONUS = [10, 7, 5, 4, 3, 2, 1, 0];

/** Compute final score = position bonus + butterflies */
export function computeScore(position: number, butterflies: number): number {
  return (POSITION_BONUS[position] ?? 0) + butterflies;
}
