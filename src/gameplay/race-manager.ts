import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { AiController, AiInput } from '../ai/ai-controller';
import { DifficultyProfile, DIFFICULTY_PROFILES } from '../ai/difficulty';
import { ItemSystem } from './item-system';
import { ButterflySystem } from './butterfly-system';
import { resolveCollisions } from '../physics/collision';
import { CharacterDef, CHARACTERS } from '../config/characters';
import { Difficulty } from '../core/game-state';
import { InputState } from '../core/input-manager';
import { TOTAL_LAPS, TOTAL_RACERS, COUNTDOWN_DURATION } from '../config/constants';
import { events } from '../core/event-bus';

export class RaceManager {
  karts: Kart[] = [];
  track: Track;
  aiControllers: AiController[] = [];
  itemSystem: ItemSystem;
  butterflySystem: ButterflySystem;

  raceTime = 0;
  countdownTime = COUNTDOWN_DURATION;
  isCountingDown = true;
  isFinished = false;

  /** 0-indexed positions (index = kart array index, value = position 0..7) */
  positions: number[] = [];

  private difficulty: DifficultyProfile;
  private humanKartIndex = 0;

  constructor(track: Track, playerCharId: string, difficulty: Difficulty, allowClones: boolean) {
    this.track = track;
    this.difficulty = DIFFICULTY_PROFILES[difficulty];
    this.itemSystem = new ItemSystem(track);
    this.butterflySystem = new ButterflySystem(track);

    // Pick characters for all 8 slots
    const playerChar = CHARACTERS.find(c => c.id === playerCharId) ?? CHARACTERS[0];
    const cpuChars = this.pickCpuCharacters(playerChar, allowClones);

    // Create karts
    const allChars = [playerChar, ...cpuChars];
    for (let i = 0; i < TOTAL_RACERS; i++) {
      this.karts.push(new Kart(i, allChars[i], i === 0));
    }

    // Place on starting grid
    this.placeOnGrid();

    // Create AI controllers for CPU karts
    for (let i = 1; i < TOTAL_RACERS; i++) {
      this.aiControllers.push(new AiController(this.karts[i], track, this.difficulty));
    }

    // Init positions
    this.positions = Array.from({ length: TOTAL_RACERS }, (_, i) => i);
  }

  get humanKart(): Kart {
    return this.karts[this.humanKartIndex];
  }

  /** Update one physics frame */
  update(dt: number, humanInput: InputState): void {
    // ── Countdown ──
    if (this.isCountingDown) {
      this.countdownTime -= dt;
      if (this.countdownTime <= 0) {
        this.isCountingDown = false;
        events.emit('race-start');
      }
      return;
    }

    if (this.isFinished) return;

    this.raceTime += dt;

    // ── Update human kart ──
    const hk = this.humanKart;
    const accel = humanInput.forward ? 1 : (humanInput.backward ? -1 : 0);
    const steer = (humanInput.left ? 1 : 0) + (humanInput.right ? -1 : 0);
    const onRoad = this.track.isOnRoad(hk.position);
    const inDrift = this.track.isInZone(hk.position, 'drift');
    hk.updatePhysics(dt, accel, steer, humanInput.drift, onRoad, inDrift);

    // Update turbo timer
    if (hk.turboTimer > 0) hk.turboTimer -= dt;

    // ── Update AI karts ──
    for (let i = 0; i < this.aiControllers.length; i++) {
      const kart = this.karts[i + 1]; // AI karts start at index 1
      const ai = this.aiControllers[i];
      const aiInput = ai.update(dt, this.karts, this.raceTime);

      const onRoadAi = this.track.isOnRoad(kart.position);
      const inDriftAi = this.track.isInZone(kart.position, 'drift');
      kart.updatePhysics(dt, aiInput.accel, aiInput.steer, aiInput.drift, onRoadAi, inDriftAi);

      if (kart.turboTimer > 0) kart.turboTimer -= dt;

      // AI item usage
      if (aiInput.useItem) {
        this.itemSystem.useItem(kart, this.karts, this.positions);
      }
    }

    // ── Collisions ──
    resolveCollisions(this.karts, this.track);

    // ── Race progress + positions ──
    for (const kart of this.karts) {
      const t = this.track.spline.closestT(kart.position);
      kart.updateProgress(t, this.raceTime);
    }

    this.updatePositions();

    // ── Item pickups ──
    this.itemSystem.updatePickups(dt, this.karts, this.positions);

    // ── Butterfly collection ──
    this.butterflySystem.update(dt, this.karts, this.track);

    // ── Finish detection ──
    for (const kart of this.karts) {
      if (kart.lap >= TOTAL_LAPS && !kart.finished) {
        kart.finished = true;
        kart.finishTime = this.raceTime;
        if (kart.isHuman) {
          events.emit('player-finished', this.positions[kart.id]);
        }
      }
    }

    // All karts finished?
    if (this.karts.every(k => k.finished)) {
      this.isFinished = true;
      events.emit('race-finished');
    }
  }

  /** Human uses their held item. Returns toast message or null. */
  usePlayerItem(): string | null {
    return this.itemSystem.useItem(this.humanKart, this.karts, this.positions);
  }

  /** Sort karts by race progress (descending) */
  private updatePositions(): void {
    const sorted = this.karts
      .map((k, i) => ({ idx: i, progress: k.raceProgress, finished: k.finished, finishTime: k.finishTime }))
      .sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      });

    for (let pos = 0; pos < sorted.length; pos++) {
      this.positions[sorted[pos].idx] = pos;
    }
  }

  /** Place 8 karts on a 2-wide starting grid */
  private placeOnGrid(): void {
    const startT = 0.05; // well past start/finish line
    const center = this.track.spline.getPoint(startT);
    const tangent = this.track.spline.getTangent(startT);
    const right = this.track.spline.getRight(startT);
    const heading = Math.atan2(tangent.x, tangent.z);

    for (let i = 0; i < this.karts.length; i++) {
      const row = Math.floor(i / 2);
      const col = (i % 2) === 0 ? -1 : 1;

      const pos = center.clone()
        .add(tangent.clone().multiplyScalar(-row * 5))
        .add(right.clone().multiplyScalar(col * 3));

      // Compute each kart's actual spline t so positions don't wrap around start line
      const actualT = this.track.spline.closestT(pos);
      this.karts[i].placeOnGrid(pos, heading, actualT);
    }
  }

  /** Pick 7 CPU characters (avoiding player's unless clones allowed) */
  private pickCpuCharacters(player: CharacterDef, allowClones: boolean): CharacterDef[] {
    let pool = [...CHARACTERS];
    if (!allowClones) {
      pool = pool.filter(c => c.id !== player.id);
    }

    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Take 7 (with wrapping if clones allowed and pool is small)
    const result: CharacterDef[] = [];
    for (let i = 0; i < TOTAL_RACERS - 1; i++) {
      result.push(pool[i % pool.length]);
    }
    return result;
  }
}
