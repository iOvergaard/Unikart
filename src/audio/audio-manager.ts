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
  click: 'audio/click_003.mp3',
  pickup: 'audio/pickup2.mp3',
  turbo: 'audio/upgrade3.mp3',
  gust: 'audio/laser2.mp3',
  wobble: 'audio/hurt3.mp3',
  boost: 'audio/upgrade1.mp3',
  countdown: 'audio/bong_001.mp3',
  lap: 'audio/confirmation_002.mp3',
  bump: 'audio/impactSoft_medium_001.mp3',
  butterfly: 'audio/coin3.mp3',
} as const;

type SampleName = keyof typeof SAMPLES;

export class AudioManager {
  private started = false;

  // ── Native Web Audio for samples (iOS-compatible) ──
  private ctx: AudioContext | null = null;
  private sampleBuffers: Partial<Record<SampleName, AudioBuffer>> = {};
  private sfxGain: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  // ── Tone.js for oscillators ──
  private toneStarted = false;
  private engineOsc!: Tone.Oscillator;
  private engineOscHigh!: Tone.Oscillator;
  private engineOscSub!: Tone.Oscillator;
  private engineFilter!: Tone.Filter;
  private engineLfo!: Tone.LFO;
  private engineLfoGain!: Tone.Gain;
  private engineBus!: Tone.Gain;
  private engineRunning = false;

  private driftOsc!: Tone.Oscillator;
  private driftGain!: Tone.Gain;
  private driftRunning = false;

  // ── Previous-state tracking ──
  private prevDriftCharging = false;
  private prevDriftTier = 0;
  private prevDriftBoosting = false;
  private prevHeldItem: string | null = null;
  private prevCountdownSec = 4;
  private prevLap = 0;
  private prevButterflies = 0;

  /** Call on first user interaction to unlock Web Audio */
  async resume(): Promise<void> {
    if (this.started) return;

    // Create native AudioContext for samples
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Gain chain: sfxGain → masterGain → destination
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterGainNode.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.masterGainNode);

    // Start loading samples in background
    this.loadAllSamples();

    // Start Tone.js for oscillators
    await Tone.start();
    this.toneStarted = true;
    this.initToneNodes();

    this.started = true;
  }

  /** Load all samples via fetch + decodeAudioData (iOS-safe) */
  private async loadAllSamples(): Promise<void> {
    if (!this.ctx) return;
    const entries = Object.entries(SAMPLES) as [SampleName, string][];
    await Promise.all(entries.map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        this.sampleBuffers[name] = await this.ctx!.decodeAudioData(buf);
      } catch {
        // Silently skip failed loads
      }
    }));
  }

  /** Create Tone.js oscillator nodes */
  private initToneNodes(): void {
    // Engine bus (connects to Tone destination — separate from native ctx)
    this.engineBus = new Tone.Gain(0.15).toDestination();

    // LFO-modulated amplitude for idle "putt-putt"
    this.engineLfoGain = new Tone.Gain(1).connect(this.engineBus);
    this.engineLfo = new Tone.LFO(8, 0.3, 1).connect(this.engineLfoGain.gain);

    // Layered oscillators → shared filter → LFO gain → bus
    this.engineFilter = new Tone.Filter(300, 'lowpass', -24).connect(this.engineLfoGain);
    this.engineOsc = new Tone.Oscillator(ENGINE_BASE_FREQ, 'sawtooth').connect(this.engineFilter);
    this.engineOscHigh = new Tone.Oscillator(ENGINE_BASE_FREQ * 2, 'square').connect(this.engineFilter);
    this.engineOscHigh.volume.value = -14;
    this.engineOscSub = new Tone.Oscillator(ENGINE_BASE_FREQ * 0.5, 'triangle').connect(this.engineFilter);
    this.engineOscSub.volume.value = -8;

    // Drift charge (square wave, starts silent)
    this.driftGain = new Tone.Gain(0).toDestination();
    this.driftOsc = new Tone.Oscillator(DRIFT_CHARGE_FREQS[0], 'square').connect(this.driftGain);
  }

  /** Called each frame during a race */
  update(_dt: number, humanKart: Kart, race: RaceManager): void {
    if (!this.started) return;

    // ── Engine pitch + volume + LFO ──
    if (this.engineRunning) {
      const speedRatio = Math.min(Math.abs(humanKart.speed) / (humanKart.baseMaxSpeed || BASE_MAX_SPEED), 1);
      const curve = speedRatio * speedRatio * 0.4 + speedRatio * 0.6;
      const freq = ENGINE_BASE_FREQ + (ENGINE_MAX_FREQ - ENGINE_BASE_FREQ) * curve;
      this.engineOsc.frequency.value = freq;
      this.engineOscHigh.frequency.value = freq * 2;
      this.engineOscSub.frequency.value = freq * 0.5;
      this.engineFilter.frequency.value = 180 + 900 * curve;
      this.engineLfo.frequency.value = 6 + 14 * speedRatio;
      this.engineLfo.min = 0.3 + 0.6 * speedRatio;
      this.engineLfo.max = 1;
      const vol = speedRatio < 0.6
        ? 0.1 + 0.9 * (speedRatio / 0.6)
        : 1.0 - 0.3 * ((speedRatio - 0.6) / 0.4);
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
      case 'turbo': this.playSample('turbo'); break;
      case 'gust': this.playSample('gust'); break;
      case 'wobble': this.playSample('wobble'); break;
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
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  /** Set music volume (0..1) — reserved for future music loop */
  setMusicVolume(_v: number): void {
    // No music loop yet
  }

  /** Mute all audio (e.g. when paused) */
  mute(): void {
    if (this.masterGainNode) this.masterGainNode.gain.value = 0;
    if (this.toneStarted) Tone.getDestination().volume.value = -Infinity;
  }

  /** Unmute all audio (e.g. when resuming) */
  unmute(): void {
    if (this.masterGainNode) this.masterGainNode.gain.value = 0.8;
    if (this.toneStarted) Tone.getDestination().volume.value = 0;
  }

  /** Start continuous sounds at race begin */
  startRace(): void {
    if (!this.started) return;
    this.resetPrevState();
    if (!this.engineRunning && this.toneStarted) {
      this.engineOsc.start();
      this.engineOscHigh.start();
      this.engineOscSub.start();
      this.engineLfo.start();
      this.engineRunning = true;
    }
  }

  /** Stop all continuous sounds at race end */
  stopRace(): void {
    if (!this.started) return;
    if (this.engineRunning) {
      this.engineOsc.stop();
      this.engineOscHigh.stop();
      this.engineOscSub.stop();
      this.engineLfo.stop();
      this.engineRunning = false;
    }
    this.stopDriftCharge();
    this.resetPrevState();
  }

  // ── Internal helpers ──

  /** Play a sample using native Web Audio API */
  private playSample(name: SampleName, playbackRate = 1): void {
    if (!this.ctx || !this.sfxGain) return;
    const buffer = this.sampleBuffers[name];
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(this.sfxGain);
    source.start(0);
  }

  private startDriftCharge(): void {
    if (this.driftRunning || !this.toneStarted) return;
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
