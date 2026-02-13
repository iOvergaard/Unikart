import { GameState } from './core/game-state';
import { InputManager } from './core/input-manager';
import { events } from './core/event-bus';
import { SceneManager } from './rendering/scene-manager';
import { UiManager, RaceHudData } from './ui/ui-manager';
import { RaceManager } from './gameplay/race-manager';
import { Track } from './track/track';
import { TRACKS } from './config/tracks';
import { FIXED_DT, TOTAL_LAPS } from './config/constants';
import { computeScore } from './gameplay/butterfly-system';
import { AudioManager } from './audio/audio-manager';

// ── Bootstrap ────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const state = new GameState();
const input = new InputManager();
const scene = new SceneManager(canvas);
const audio = new AudioManager();
let race: RaceManager | null = null;
let track: Track | null = null;

// Minimap data cache
let minimapPoints: { x: number; y: number }[] = [];
let minimapBounds = { minX: 0, minZ: 0, scale: 1, padding: 15 };

// ── UI Manager ───────────────────────────────────────────
const ui = new UiManager((action, value) => {
  audio.resume().then(() => audio.playUiClick());
  switch (action) {
    // Main menu
    case 'play':
      state.transition('track-select');
      break;
    case 'options':
      state.transition('options');
      break;

    // Track select
    case 'select-track':
      state.raceSettings.trackId = value;
      break;
    case 'next-to-character':
      state.transition('character-select');
      break;
    case 'back-to-menu':
      state.transition('main-menu');
      break;

    // Character select
    case 'select-character':
      state.raceSettings.characterId = value;
      break;
    case 'next-to-settings':
      state.transition('race-settings');
      break;
    case 'back-to-tracks':
      state.transition('track-select');
      break;

    // Race settings
    case 'set-difficulty':
      state.raceSettings.difficulty = value as any;
      break;
    case 'toggle-mirror':
      state.raceSettings.mirrorMode = value;
      break;
    case 'toggle-clones':
      state.raceSettings.allowClones = value;
      break;
    case 'back-to-characters':
      state.transition('character-select');
      break;
    case 'start-race':
      startRace();
      break;

    // In-race
    case 'resume':
      state.transition('racing');
      break;
    case 'restart':
      startRace();
      break;
    case 'quit':
      endRace();
      state.transition('main-menu');
      break;

    // Options
    case 'music-volume':
      state.musicVolume = parseInt(value) / 100;
      audio.setMusicVolume(state.musicVolume);
      break;
    case 'sfx-volume':
      state.sfxVolume = parseInt(value) / 100;
      audio.setSfxVolume(state.sfxVolume);
      break;
  }
});

// ── Race lifecycle ───────────────────────────────────────
function startRace(): void {
  endRace(); // cleanup any existing

  const trackDef = TRACKS.find(t => t.id === state.raceSettings.trackId) ?? TRACKS[0];
  track = new Track(trackDef, state.raceSettings.mirrorMode);
  race = new RaceManager(
    track,
    state.raceSettings.characterId,
    state.raceSettings.difficulty,
    state.raceSettings.allowClones,
  );

  scene.setupTrack(track);
  scene.setupKarts(race.karts);
  scene.setupItemBoxes(race.itemSystem.boxes);
  scene.setupButterflies(race.butterflySystem.butterflies);
  scene.setupObstacles(race.obstacleSystem.obstacles);

  // Pre-compute minimap points
  minimapPoints = computeMinimapPoints(track);

  audio.startRace();
  input.setTouchControlsVisible(true);
  state.transition('countdown');
}

function endRace(): void {
  if (race) {
    audio.stopRace();
    input.setTouchControlsVisible(false);
    scene.cleanup();
    race = null;
    track = null;
  }
}

// ── Events ───────────────────────────────────────────────
events.on('player-finished', (position: number) => {
  audio.stopRace();
  input.setTouchControlsVisible(false);
  // Show results after a short delay
  setTimeout(() => {
    if (race) {
      state.transition('results');
    }
  }, 2000);
});

events.on('race-finished', () => {
  audio.stopRace();
  if (state.screen !== 'results') {
    state.transition('results');
  }
});

// ── Game loop ────────────────────────────────────────────
let lastTime = 0;
let accumulator = 0;
let pendingToast: string | null = null;

function gameLoop(time: number): void {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((time - lastTime) / 1000, 0.1); // cap delta
  lastTime = time;

  input.update();

  // Handle pause toggle
  if (input.pausePressed && state.screen === 'racing') {
    state.transition('paused');
  } else if (input.pausePressed && state.screen === 'paused') {
    state.transition('racing');
  }

  // ── Physics (fixed timestep) ──
  if (race && (state.screen === 'racing' || state.screen === 'countdown')) {
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      race.update(FIXED_DT, input.state);

      // Human item usage
      if (input.itemPressed && state.screen === 'racing') {
        const itemId = race.humanKart.heldItem;
        const result = race.usePlayerItem();
        if (result && itemId) {
          pendingToast = result;
          audio.playItemUse(itemId);
        }
      }

      // Obstacle events (toast for human kart only)
      const obsEvents = race.obstacleSystem.drainEvents();
      for (const evt of obsEvents) {
        if (evt.kartId === race.humanKart.id) {
          pendingToast = evt.message;
        }
      }

      accumulator -= FIXED_DT;
    }
  }

  // ── Audio ──
  if (race) {
    audio.update(dt, race.humanKart, race);
  }

  // ── Rendering ──
  if (race && track) {
    // Sync butterfly meshes (add new, remove collected)
    const newButterflies = race.butterflySystem.getNewButterflies(scene.knownButterflyCount);
    if (newButterflies.length > 0) scene.addNewButterflies(newButterflies);
    const collected = race.butterflySystem.drainCollected();
    if (collected.length > 0) scene.removeButterflies(collected);
    scene.updateButterflies(race.raceTime);
    scene.updateItemBoxes(race.itemSystem.boxes, race.raceTime);
    scene.updateObstacles(race.obstacleSystem.obstacles, race.raceTime);

    scene.updateFrame(race.karts, race.humanKart, dt);
    scene.render();
  }

  // ── UI ──
  const hudData = buildHudData();

  if (state.screen === 'countdown' && race) {
    if (race.isCountingDown) {
      ui.show('countdown', state, { ...hudData, countdown: race.countdownTime });
      return; // don't call ui.show again with missing countdown data
    } else {
      state.transition('racing');
    }
  }

  ui.show(state.screen, state, hudData);
}

function buildHudData(): RaceHudData {
  if (!race || !track) {
    return {
      position: 0, lap: 0, raceTime: 0, heldItem: null, butterflies: 0,
      driftTier: 0, isBoosting: false, minimapPoints: [], minimapDots: [],
    };
  }

  const hk = race.humanKart;
  const dots = race.karts.map(k => {
    const mp = worldToMinimap(k.position);
    return { x: mp.x, y: mp.y, isHuman: k.isHuman };
  });

  // Results standings: sort by position for scoring, then compute scores
  const positionSorted = race.karts
    .slice()
    .sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceProgress - a.raceProgress;
    });

  const standings = positionSorted.map((k, i) => ({
    name: k.character.name,
    time: k.finished ? k.finishTime : race!.raceTime,
    isHuman: k.isHuman,
    butterflies: k.butterflies,
    score: computeScore(i, k.butterflies),
  }));

  // Grab and clear pending toast
  const toast = pendingToast;
  pendingToast = null;

  return {
    position: race.positions[hk.id],
    lap: hk.lap,
    raceTime: race.raceTime,
    heldItem: hk.heldItem,
    butterflies: hk.butterflies,
    driftTier: hk.drift.isCharging ? hk.drift.tier : 0,
    isBoosting: hk.drift.isBoosting,
    toast: toast ?? undefined,
    minimapPoints,
    minimapDots: dots,
    standings,
  };
}

// ── Minimap helpers ──────────────────────────────────────
function computeMinimapPoints(track: Track): { x: number; y: number }[] {
  const points = track.spline.getEvenPoints(80);

  // Find bounding box
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }

  const padding = 15;
  const rangeX = maxX - minX + padding * 2;
  const rangeZ = maxZ - minZ + padding * 2;
  const scale = 130 / Math.max(rangeX, rangeZ);

  // Cache bounds for worldToMinimap
  minimapBounds = { minX, minZ, scale, padding };

  return points.map(p => ({
    x: (p.x - minX + padding) * scale + 10,
    y: (p.z - minZ + padding) * scale + 10,
  }));
}

function worldToMinimap(pos: { x: number; z: number }): { x: number; y: number } {
  const { minX, minZ, scale, padding } = minimapBounds;
  return {
    x: (pos.x - minX + padding) * scale + 10,
    y: (pos.z - minZ + padding) * scale + 10,
  };
}

// ── Start! ───────────────────────────────────────────────
ui.show('main-menu', state);
requestAnimationFrame(gameLoop);
