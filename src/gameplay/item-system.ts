import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { rollItem, ITEM_EFFECTS, ItemId } from '../config/items';

export class ItemSystem {
  private pickupCooldowns = new Map<number, number>(); // kartId → cooldown

  /** Check item zone pickups for all karts */
  updatePickups(karts: Kart[], track: Track, positions: number[]): void {
    for (let i = 0; i < karts.length; i++) {
      const kart = karts[i];
      if (kart.heldItem !== null) continue; // already holding

      // Cooldown check
      const cd = this.pickupCooldowns.get(kart.id) ?? 0;
      if (cd > 0) continue;

      if (track.isInZone(kart.position, 'item')) {
        const position = positions[i]; // 0-based race position
        const item = rollItem(position);
        kart.heldItem = item.id;
        this.pickupCooldowns.set(kart.id, 60); // 60 frames cooldown
      }
    }

    // Tick cooldowns
    for (const [id, cd] of this.pickupCooldowns) {
      if (cd > 0) this.pickupCooldowns.set(id, cd - 1);
    }
  }

  /** Use the held item */
  useItem(user: Kart, allKarts: Kart[], positions: number[]): boolean {
    if (!user.heldItem) return false;

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
        return false;
    }
  }

  private applyGust(user: Kart, allKarts: Kart[], positions: number[]): boolean {
    const target = this.findTargetAhead(user, allKarts, positions);
    if (!target) return false;

    target.gustTimer = ITEM_EFFECTS.gust.steerLockDuration;
    target.spinAngle = 0;
    target.drift.cancel();
    return true;
  }

  private applyWobble(user: Kart, allKarts: Kart[], positions: number[]): boolean {
    const target = this.findTargetAhead(user, allKarts, positions);
    if (!target) return false;

    target.wobbleTimer = ITEM_EFFECTS.wobble.duration;
    return true;
  }

  private applyTurbo(user: Kart): boolean {
    user.turboTimer = ITEM_EFFECTS.turbo.duration;
    return true;
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
