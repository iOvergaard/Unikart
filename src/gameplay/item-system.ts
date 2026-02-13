import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { rollItem, ITEM_EFFECTS, ItemId } from '../config/items';

const PICKUP_RADIUS = 3;
const RESPAWN_TIME = 5; // seconds

export interface ItemBox {
  id: number;
  position: THREE.Vector3;
  active: boolean;
  respawnTimer: number;
}

export class ItemSystem {
  boxes: ItemBox[] = [];
  private nextId = 0;

  constructor(track: Track) {
    // Place 3 boxes per item zone
    for (const zone of track.zones) {
      if (zone.type !== 'item') continue;
      const midT = (zone.start + zone.end) / 2;
      const center = track.spline.getPoint(midT);
      const right = track.spline.getRight(midT);

      for (const offset of [-5, 0, 5]) {
        const pos = center.clone().add(right.clone().multiplyScalar(offset));
        pos.y = 1.8;
        this.boxes.push({
          id: this.nextId++,
          position: pos,
          active: true,
          respawnTimer: 0,
        });
      }
    }
  }

  /** Check proximity pickups + tick respawn timers */
  updatePickups(dt: number, karts: Kart[], positions: number[]): void {
    // Tick respawn timers
    for (const box of this.boxes) {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
        }
      }
    }

    // Check kart-box proximity
    for (let i = 0; i < karts.length; i++) {
      const kart = karts[i];
      if (kart.heldItem !== null) continue;

      for (const box of this.boxes) {
        if (!box.active) continue;
        const dx = kart.position.x - box.position.x;
        const dz = kart.position.z - box.position.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          const position = positions[i];
          const item = rollItem(position);
          kart.heldItem = item.id;
          box.active = false;
          box.respawnTimer = RESPAWN_TIME;
          break; // one box per frame per kart
        }
      }
    }
  }

  /** Get IDs of boxes that just became inactive (for scene to hide) */
  getInactiveBoxIds(): number[] {
    return this.boxes.filter(b => !b.active && b.respawnTimer > RESPAWN_TIME - 0.05).map(b => b.id);
  }

  /** Get IDs of boxes that just respawned (for scene to show) */
  getRespawnedBoxIds(): number[] {
    return this.boxes.filter(b => b.active && b.respawnTimer <= 0).map(b => b.id);
  }

  /** Use the held item. Returns a description of what happened, or null if nothing. */
  useItem(user: Kart, allKarts: Kart[], positions: number[]): string | null {
    if (!user.heldItem) return null;

    const itemId = user.heldItem;
    user.heldItem = null;

    switch (itemId) {
      case 'gust':
        return this.applyGust(user, allKarts, positions);
      case 'wobble':
        return this.applyWobble(user, allKarts, positions);
      case 'turbo':
        return this.applyTurbo(user);
      default:
        return null;
    }
  }

  private applyGust(user: Kart, allKarts: Kart[], positions: number[]): string | null {
    const target = this.findTargetAhead(user, allKarts, positions);
    if (!target) return null;

    target.gustTimer = ITEM_EFFECTS.gust.steerLockDuration;
    target.spinAngle = 0;
    target.drift.cancel();
    return `💨 Gust hit ${target.character.name}!`;
  }

  private applyWobble(user: Kart, allKarts: Kart[], positions: number[]): string | null {
    const target = this.findTargetAhead(user, allKarts, positions);
    if (!target) return null;

    target.wobbleTimer = ITEM_EFFECTS.wobble.duration;
    return `🌀 Wobble hit ${target.character.name}!`;
  }

  private applyTurbo(user: Kart): string {
    user.turboTimer = ITEM_EFFECTS.turbo.duration;
    return '⚡ TURBO!';
  }

  /** Find the nearest opponent ahead in race position */
  private findTargetAhead(user: Kart, allKarts: Kart[], positions: number[]): Kart | null {
    const userPos = positions[allKarts.indexOf(user)];
    if (userPos === undefined || userPos === 0) {
      // Already in first — target random opponent
      const others = allKarts.filter(k => k.id !== user.id);
      return others[Math.floor(Math.random() * others.length)] ?? null;
    }

    // Find the kart one position ahead
    for (let i = 0; i < allKarts.length; i++) {
      if (positions[i] === userPos - 1) return allKarts[i];
    }
    return null;
  }
}
