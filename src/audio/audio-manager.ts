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

  // ── Native Web Audio (single AudioContext for everything) ──
  private ctx: AudioContext | null = null;
  private sampleBuffers: Partial<Record<SampleName, AudioBuffer>> = {};
  private sfxGain: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  // ── Engine oscillators (native) ──
  private engineOsc: OscillatorNode | null = null;
  private engineOscHigh: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineLfo: OscillatorNode | null = null;
  private engineLfoGain: GainNode | null = null;
  private engineBusGain: GainNode | null = null;
  private engineRunning = false;

  // ── Drift oscillator (native) ──
  private driftOsc: OscillatorNode | null = null;
  private driftGainNode: GainNode | null = null;
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

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Master gain → destination
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterGainNode.connect(this.ctx.destination);

    // SFX gain → master
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.masterGainNode);

    // Load samples in background
    this.loadAllSamples();

    this.started = true;
  }

  /** Load all samples via fetch + decodeAudioData */
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

  /** Create engine oscillator nodes (called on race start) */
  private createEngineNodes(): void {
    if (!this.ctx || !this.masterGainNode) return;

    // Engine bus gain → master
    this.engineBusGain = this.ctx.createGain();
    this.engineBusGain.gain.value = 0.15;
    this.engineBusGain.connect(this.masterGainNode);

    // LFO gain node (amplitude modulation for idle chug)
    this.engineLfoGain = this.ctx.createGain();
    this.engineLfoGain.gain.value = 1;
    this.engineLfoGain.connect(this.engineBusGain);

    // LFO oscillator → controls engineLfoGain.gain
    this.engineLfo = this.ctx.createOscillator();
    this.engineLfo.frequency.value = 8;
    const lfoScaler = this.ctx.createGain();
    lfoScaler.gain.value = 0.35; // LFO depth
    this.engineLfo.connect(lfoScaler);
    lfoScaler.connect(this.engineLfoGain.gain);

    // Low-pass filter → LFO gain
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineFilter.Q.value = 0.5;
    this.engineFilter.connect(this.engineLfoGain);

    // Main sawtooth oscillator
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = ENGINE_BASE_FREQ;
    this.engineOsc.connect(this.engineFilter);

    // High harmonic (square, quieter)
    this.engineOscHigh = this.ctx.createOscillator();
    this.engineOscHigh.type = 'square';
    this.engineOscHigh.frequency.value = ENGINE_BASE_FREQ * 2;
    const highGain = this.ctx.createGain();
    highGain.gain.value = 0.2; // ~-14dB
    this.engineOscHigh.connect(highGain);
    highGain.connect(this.engineFilter);

    // Sub harmonic (triangle, moderate)
    this.engineOscSub = this.ctx.createOscillator();
    this.engineOscSub.type = 'triangle';
    this.engineOscSub.frequency.value = ENGINE_BASE_FREQ * 0.5;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.4; // ~-8dB
    this.engineOscSub.connect(subGain);
    subGain.connect(this.engineFilter);

    // Start all
    this.engineOsc.start();
    this.engineOscHigh.start();
    this.engineOscSub.start();
    this.engineLfo.start();
  }

  /** Destroy engine oscillator nodes (called on race end) */
  private destroyEngineNodes(): void {
    this.engineOsc?.stop();
    this.engineOscHigh?.stop();
    this.engineOscSub?.stop();
    this.engineLfo?.stop();
    this.engineOsc = null;
    this.engineOscHigh = null;
    this.engineOscSub = null;
    this.engineLfo = null;
    this.engineLfoGain = null;
    this.engineFilter = null;
    this.engineBusGain = null;
  }

  /** Called each frame during a race */
  update(_dt: number, humanKart: Kart, race: RaceManager): void {
    if (!this.started) return;

    // ── Engine pitch + volume ──
    if (this.engineRunning && this.engineOsc && this.engineOscHigh && this.engineOscSub && this.engineFilter && this.engineLfo && this.engineBusGain) {
      const speedRatio = Math.min(Math.abs(humanKart.speed) / (humanKart.baseMaxSpeed || BASE_MAX_SPEED), 1);
      const curve = speedRatio * speedRatio * 0.4 + speedRatio * 0.6;
      const freq = ENGINE_BASE_FREQ + (ENGINE_MAX_FREQ - ENGINE_BASE_FREQ) * curve;
      this.engineOsc.frequency.value = freq;
      this.engineOscHigh.frequency.value = freq * 2;
      this.engineOscSub.frequency.value = freq * 0.5;
      this.engineFilter.frequency.value = 180 + 900 * curve;
      this.engineLfo.frequency.value = 6 + 14 * speedRatio;
      const vol = speedRatio < 0.6
        ? 0.1 + 0.9 * (speedRatio / 0.6)
        : 1.0 - 0.3 * ((speedRatio - 0.6) / 0.4);
      this.engineBusGain.gain.value = 0.15 * vol;
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
    if (isCharging && tier !== this.prevDriftTier && tier > 0 && this.driftOsc) {
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

  playUiClick(): void {
    if (!this.started) return;
    this.playSample('click');
  }

  playBump(): void {
    if (!this.started) return;
    this.playSample('bump');
  }

  setSfxVolume(v: number): void {
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  setMusicVolume(_v: number): void {
    // No music loop yet
  }

  mute(): void {
    if (this.masterGainNode) this.masterGainNode.gain.value = 0;
  }

  unmute(): void {
    if (this.masterGainNode) this.masterGainNode.gain.value = 0.8;
  }

  /** Start continuous sounds at race begin */
  startRace(): void {
    if (!this.started) return;
    this.resetPrevState();
    if (!this.engineRunning) {
      this.createEngineNodes();
      this.engineRunning = true;
    }
  }

  /** Stop all continuous sounds at race end */
  stopRace(): void {
    if (!this.started) return;
    if (this.engineRunning) {
      this.destroyEngineNodes();
      this.engineRunning = false;
    }
    this.stopDriftCharge();
    this.resetPrevState();
  }

  // ── Internal helpers ──

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
    if (this.driftRunning || !this.ctx || !this.masterGainNode) return;

    this.driftGainNode = this.ctx.createGain();
    this.driftGainNode.gain.value = 0.15;
    this.driftGainNode.connect(this.masterGainNode);

    this.driftOsc = this.ctx.createOscillator();
    this.driftOsc.type = 'square';
    this.driftOsc.frequency.value = DRIFT_CHARGE_FREQS[0];
    this.driftOsc.connect(this.driftGainNode);
    this.driftOsc.start();

    this.driftRunning = true;
  }

  private stopDriftCharge(): void {
    if (!this.driftRunning) return;
    this.driftOsc?.stop();
    this.driftOsc = null;
    this.driftGainNode = null;
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
