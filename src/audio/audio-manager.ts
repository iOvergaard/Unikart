import * as Tone from 'tone';
import { Kart } from '../physics/kart';
import { RaceManager } from '../gameplay/race-manager';
import { ItemId } from '../config/items';
import {
  ENGINE_BASE_FREQ,
  ENGINE_MAX_FREQ,
  DRIFT_CHARGE_FREQS,
  BASE_MAX_SPEED,
} from '../config/constants';

/** Preloaded sample paths (served from public/audio/) */
const SAMPLES = {
  click: 'audio/click_003.ogg',
  pickup: 'audio/pickup2.ogg',
  turbo: 'audio/upgrade3.ogg',
  gust: 'audio/laser2.ogg',
  wobble: 'audio/hurt3.ogg',
  boost: 'audio/upgrade1.ogg',
  countdown: 'audio/bong_001.ogg',
  lap: 'audio/confirmation_002.ogg',
  bump: 'audio/impactSoft_medium_001.ogg',
  butterfly: 'audio/coin3.ogg',
} as const;

export class AudioManager {
  private started = false;

  // ── Gain buses ──
  private masterGain: Tone.Gain;
  private sfxBus: Tone.Gain;
  private engineBus: Tone.Gain;

  // ── Engine (oscillator — needs continuous pitch tracking) ──
  private engineOsc: Tone.Oscillator;
  private engineFilter: Tone.Filter;
  private engineRunning = false;

  // ── Drift charge (oscillator — needs continuous pitch stepping) ──
  private driftOsc: Tone.Oscillator;
  private driftGain: Tone.Gain;
  private driftRunning = false;

  // ── Sample players ──
  private players: Record<keyof typeof SAMPLES, Tone.Player> = {} as any;

  // ── Previous-state tracking ──
  private prevDriftCharging = false;
  private prevDriftTier = 0;
  private prevDriftBoosting = false;
  private prevHeldItem: string | null = null;
  private prevCountdownSec = 4;
  private prevLap = 0;
  private prevButterflies = 0;

  constructor() {
    // Master → destination
    this.masterGain = new Tone.Gain(0.8).toDestination();

    // Buses → master
    this.sfxBus = new Tone.Gain(0.8).connect(this.masterGain);
    this.engineBus = new Tone.Gain(0.15).connect(this.masterGain);

    // ── Engine oscillator (sawtooth + low-pass) ──
    this.engineFilter = new Tone.Filter(300, 'lowpass').connect(this.engineBus);
    this.engineOsc = new Tone.Oscillator(ENGINE_BASE_FREQ, 'sawtooth').connect(this.engineFilter);

    // ── Drift charge (square wave, starts silent) ──
    this.driftGain = new Tone.Gain(0).connect(this.sfxBus);
    this.driftOsc = new Tone.Oscillator(DRIFT_CHARGE_FREQS[0], 'square').connect(this.driftGain);

    // ── Load all samples ──
    for (const [key, url] of Object.entries(SAMPLES)) {
      this.players[key as keyof typeof SAMPLES] = new Tone.Player(url).connect(this.sfxBus);
    }
  }

  /** Call on first user interaction to unlock Web Audio */
  async resume(): Promise<void> {
    if (this.started) return;
    await Tone.start();
    this.started = true;
  }

  /** Called each frame during a race */
  update(_dt: number, humanKart: Kart, race: RaceManager): void {
    if (!this.started) return;

    // ── Engine pitch + volume ──
    if (this.engineRunning) {
      const speedRatio = Math.min(Math.abs(humanKart.speed) / (humanKart.baseMaxSpeed || BASE_MAX_SPEED), 1);
      const freq = ENGINE_BASE_FREQ + (ENGINE_MAX_FREQ - ENGINE_BASE_FREQ) * speedRatio;
      this.engineOsc.frequency.value = freq;
      this.engineFilter.frequency.value = 200 + 600 * speedRatio;
      // Taper engine volume: rises to mid-speed then eases down at top speed
      const vol = speedRatio < 0.6
        ? 0.1 + 0.9 * (speedRatio / 0.6)
        : 1.0 - 0.4 * ((speedRatio - 0.6) / 0.4);
      this.engineBus.gain.value = 0.15 * vol;
    }

    // ── Drift charge start/stop ──
    const isCharging = humanKart.drift.isCharging;
    if (isCharging && !this.prevDriftCharging) {
      this.startDriftCharge();
    } else if (!isCharging && this.prevDriftCharging) {
      this.stopDriftCharge();
    }
    this.prevDriftCharging = isCharging;

    // ── Drift tier change ──
    const tier = humanKart.drift.tier;
    if (isCharging && tier !== this.prevDriftTier && tier > 0) {
      this.driftOsc.frequency.value = DRIFT_CHARGE_FREQS[Math.min(tier - 1, 2)];
    }
    this.prevDriftTier = tier;

    // ── Boost detect ──
    const isBoosting = humanKart.drift.isBoosting;
    if (isBoosting && !this.prevDriftBoosting) {
      this.playSample('boost');
    }
    this.prevDriftBoosting = isBoosting;

    // ── Item pickup detect ──
    const heldItem = humanKart.heldItem;
    if (heldItem !== null && this.prevHeldItem === null) {
      this.playSample('pickup');
    }
    this.prevHeldItem = heldItem;

    // ── Butterfly collect ──
    const butterflies = humanKart.butterflies;
    if (butterflies > this.prevButterflies) {
      this.playSample('butterfly');
    }
    this.prevButterflies = butterflies;

    // ── Countdown beeps ──
    if (race.isCountingDown) {
      const sec = Math.ceil(race.countdownTime);
      if (sec !== this.prevCountdownSec && sec >= 1 && sec <= 3) {
        this.playSample('countdown');
      }
      // GO beep — play countdown sample at higher playback rate
      if (this.prevCountdownSec >= 1 && sec <= 0) {
        this.playSample('countdown', 1.5);
      }
      this.prevCountdownSec = sec;
    }

    // ── Lap crossing chime ──
    const lap = humanKart.lap;
    if (lap > this.prevLap && lap > 0) {
      this.playSample('lap');
    }
    this.prevLap = lap;
  }

  /** Play an item-use sound by item ID */
  playItemUse(itemId: ItemId): void {
    if (!this.started) return;
    switch (itemId) {
      case 'turbo':
        this.playSample('turbo');
        break;
      case 'gust':
        this.playSample('gust');
        break;
      case 'wobble':
        this.playSample('wobble');
        break;
    }
  }

  /** Play UI click sound */
  playUiClick(): void {
    if (!this.started) return;
    this.playSample('click');
  }

  /** Play bump/collision sound */
  playBump(): void {
    if (!this.started) return;
    this.playSample('bump');
  }

  /** Set SFX volume (0..1) */
  setSfxVolume(v: number): void {
    this.sfxBus.gain.value = v;
  }

  /** Set music volume (0..1) — reserved for future music loop */
  setMusicVolume(_v: number): void {
    // No music loop yet; placeholder for Phase 8 music
  }

  /** Start continuous sounds at race begin */
  startRace(): void {
    if (!this.started) return;
    this.resetPrevState();
    if (!this.engineRunning) {
      this.engineOsc.start();
      this.engineRunning = true;
    }
  }

  /** Stop all continuous sounds at race end */
  stopRace(): void {
    if (this.engineRunning) {
      this.engineOsc.stop();
      this.engineRunning = false;
    }
    this.stopDriftCharge();
    this.resetPrevState();
  }

  // ── Internal helpers ──

  private playSample(name: keyof typeof SAMPLES, playbackRate = 1): void {
    const player = this.players[name];
    if (!player || !player.loaded) return;
    player.playbackRate = playbackRate;
    player.start();
  }

  private startDriftCharge(): void {
    if (this.driftRunning) return;
    this.driftGain.gain.value = 0.15;
    this.driftOsc.frequency.value = DRIFT_CHARGE_FREQS[0];
    this.driftOsc.start();
    this.driftRunning = true;
  }

  private stopDriftCharge(): void {
    if (!this.driftRunning) return;
    this.driftGain.gain.value = 0;
    this.driftOsc.stop();
    this.driftRunning = false;
  }

  private resetPrevState(): void {
    this.prevDriftCharging = false;
    this.prevDriftTier = 0;
    this.prevDriftBoosting = false;
    this.prevHeldItem = null;
    this.prevCountdownSec = 4;
    this.prevLap = 0;
    this.prevButterflies = 0;
  }
}
