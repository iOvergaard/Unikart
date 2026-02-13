import { GameState, GameScreen, Difficulty } from '../core/game-state';
import { CHARACTERS } from '../config/characters';
import { TRACKS } from '../config/tracks';
import { Kart } from '../physics/kart';
import { TOTAL_LAPS } from '../config/constants';

/**
 * Manages all DOM-based UI: menus, HUD, pause screen, results.
 * Each screen is a function that builds/destroys its DOM.
 */
export class UiManager {
  private overlay: HTMLDivElement;
  private currentScreen: GameScreen | null = null;
  private onAction: (action: string, data?: any) => void;

  constructor(onAction: (action: string, data?: any) => void) {
    this.overlay = document.getElementById('ui-overlay') as HTMLDivElement;
    this.onAction = onAction;
  }

  /** Show a screen (clears previous) */
  show(screen: GameScreen, state: GameState, raceData?: RaceHudData): void {
    // Don't rebuild if already on this screen (preserves click handlers)
    if (this.currentScreen === screen) {
      // Only the race HUD and countdown need per-frame updates
      if (screen === 'racing') this.updateHud(raceData!);
      if (screen === 'countdown') this.buildCountdown(raceData?.countdown ?? 3);
      return;
    }

    this.overlay.innerHTML = '';
    this.currentScreen = screen;
    this.lastCountdownNum = -1;

    switch (screen) {
      case 'main-menu': this.buildMainMenu(); break;
      case 'track-select': this.buildTrackSelect(state); break;
      case 'character-select': this.buildCharacterSelect(state); break;
      case 'race-settings': this.buildRaceSettings(state); break;
      case 'countdown': this.buildCountdown(raceData?.countdown ?? 3); break;
      case 'racing': this.buildHud(); this.updateHud(raceData!); break;
      case 'paused': this.buildPauseMenu(); break;
      case 'results': this.buildResults(raceData!); break;
      case 'options': this.buildOptions(state); break;
    }
  }

  // ── Main Menu ──────────────────────────────────────────
  private buildMainMenu(): void {
    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#ff69b4,#87ceeb,#da70d6)">
        <h1 style="font-size:4em;color:#fff;text-shadow:3px 3px 0 #c060a0;margin-bottom:10px;font-family:cursive">
          ✨ Unikart ✨
        </h1>
        <p style="font-size:1.5em;color:#fff;margin-bottom:40px;font-family:cursive">Unicorns Collect Butterflies!</p>
        <button class="menu-btn" data-action="play">🏁 Play!</button>
        <button class="menu-btn" data-action="options">⚙️ Options</button>
      </div>
      <style>
        .menu-btn {
          font-size: 1.8em; padding: 15px 50px; margin: 8px;
          border: none; border-radius: 25px; cursor: pointer;
          font-family: cursive; font-weight: bold;
          background: #fff; color: #c060a0;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          transition: transform 0.1s;
        }
        .menu-btn:hover { transform: scale(1.08); }
        .menu-btn:active { transform: scale(0.95); }
      </style>
    `;
    this.bindButtons();
  }

  // ── Track Select ───────────────────────────────────────
  private buildTrackSelect(state: GameState): void {
    const trackCards = TRACKS.map(t => `
      <div class="card ${t.available ? 'available' : 'locked'} ${state.raceSettings.trackId === t.id ? 'selected' : ''}"
           data-action="select-track" data-value="${t.id}" ${!t.available ? 'style="opacity:0.4;pointer-events:none"' : ''}>
        <div style="font-size:2em">${t.available ? '🌈' : '🔒'}</div>
        <div style="font-weight:bold;font-size:1.1em">${t.name}</div>
        <div style="font-size:0.8em;color:#888">${t.available ? t.description : 'Coming Soon!'}</div>
      </div>
    `).join('');

    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:20px;height:100%;background:rgba(0,0,0,0.7);overflow-y:auto">
        <h2 style="color:#fff;font-family:cursive;font-size:2em;margin-bottom:20px">Choose a Track!</h2>
        <div class="card-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:15px;max-width:900px">${trackCards}</div>
        <div class="nav-btns" style="margin-top:30px">
          <button class="menu-btn" data-action="next-to-character">Next →</button>
          <button class="menu-btn" data-action="back-to-menu" style="background:#eee;color:#999">← Back</button>
        </div>
      </div>
      <style>
        .card {
          background: #fff; border-radius: 15px; padding: 20px; text-align: center;
          cursor: pointer; transition: transform 0.1s; border: 3px solid transparent;
        }
        .card.selected { border-color: #ff69b4; background: #fff0f5; }
        .card:hover { transform: scale(1.05); }
      </style>
    `;
    this.bindButtons();
  }

  // ── Character Select ───────────────────────────────────
  private buildCharacterSelect(state: GameState): void {
    const charCards = CHARACTERS.map(c => {
      const colorHex = '#' + c.color.toString(16).padStart(6, '0');
      return `
        <div class="card ${state.raceSettings.characterId === c.id ? 'selected' : ''}"
             data-action="select-character" data-value="${c.id}"
             style="border-top:5px solid ${colorHex}">
          <div style="font-size:2em">🦄</div>
          <div style="font-weight:bold">${c.name}</div>
          <div style="font-size:0.75em;color:#666;margin-top:5px">
            SPD:${'★'.repeat(c.speed)}${'☆'.repeat(6-c.speed)}<br>
            ACC:${'★'.repeat(c.accel)}${'☆'.repeat(6-c.accel)}<br>
            HDL:${'★'.repeat(c.handling)}${'☆'.repeat(6-c.handling)}<br>
            WGT:${'★'.repeat(c.weight)}${'☆'.repeat(6-c.weight)}
          </div>
        </div>
      `;
    }).join('');

    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:20px;height:100%;background:rgba(0,0,0,0.7);overflow-y:auto">
        <h2 style="color:#fff;font-family:cursive;font-size:2em;margin-bottom:20px">Choose Your Racer!</h2>
        <div class="card-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:800px">${charCards}</div>
        <div class="nav-btns" style="margin-top:30px">
          <button class="menu-btn" data-action="next-to-settings">Next →</button>
          <button class="menu-btn" data-action="back-to-tracks" style="background:#eee;color:#999">← Back</button>
        </div>
      </div>
    `;
    this.bindButtons();
  }

  // ── Race Settings ──────────────────────────────────────
  private buildRaceSettings(state: GameState): void {
    const s = state.raceSettings;
    const diffBtn = (d: Difficulty, label: string, emoji: string) =>
      `<button class="diff-btn ${s.difficulty === d ? 'active' : ''}" data-action="set-difficulty" data-value="${d}">${emoji} ${label}</button>`;

    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:rgba(0,0,0,0.7)">
        <h2 style="color:#fff;font-family:cursive;font-size:2em;margin-bottom:30px">Race Settings</h2>

        <div style="margin-bottom:20px">
          <div style="color:#fff;margin-bottom:8px;font-family:cursive">Difficulty</div>
          ${diffBtn('chill', 'Chill', '😊')}
          ${diffBtn('standard', 'Standard', '🙂')}
          ${diffBtn('mean', 'Mean', '😈')}
        </div>

        <div style="margin-bottom:20px">
          <label style="color:#fff;font-family:cursive;display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" ${s.mirrorMode ? 'checked' : ''} data-action="toggle-mirror" style="width:20px;height:20px">
            🪞 Mirror Mode
          </label>
        </div>

        <div style="margin-bottom:30px">
          <label style="color:#fff;font-family:cursive;display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" ${s.allowClones ? 'checked' : ''} data-action="toggle-clones" style="width:20px;height:20px">
            👯 Allow Clones
          </label>
        </div>

        <button class="menu-btn" data-action="start-race" style="font-size:2em;background:#ff69b4;color:#fff">🏁 START RACE!</button>
        <button class="menu-btn" data-action="back-to-characters" style="background:#eee;color:#999;font-size:1em">← Back</button>
      </div>
      <style>
        .diff-btn {
          font-size:1.3em; padding:12px 25px; margin:4px; border:2px solid #fff;
          border-radius:15px; cursor:pointer; font-family:cursive;
          background:transparent; color:#fff; transition:all 0.1s;
        }
        .diff-btn.active { background:#ff69b4; border-color:#ff69b4; }
        .diff-btn:hover { transform:scale(1.05); }
      </style>
    `;
    this.bindButtons();
  }

  // ── Countdown ──────────────────────────────────────────
  private lastCountdownNum = -1;

  private buildCountdown(seconds: number): void {
    const num = Math.ceil(seconds);
    if (num === this.lastCountdownNum) return;
    this.lastCountdownNum = num;

    const text = num > 0 ? num.toString() : 'GO!';
    this.overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%">
        <div style="font-size:8em;color:#fff;text-shadow:4px 4px 0 #c060a0;font-family:cursive;
                     animation:pulse 0.5s ease-in-out">${text}</div>
      </div>
      <style>
        @keyframes pulse { 0%{transform:scale(2);opacity:0} 50%{transform:scale(1);opacity:1} }
      </style>
    `;
  }

  // ── Race HUD ───────────────────────────────────────────
  private hudEl: HTMLDivElement | null = null;

  private buildHud(): void {
    this.overlay.innerHTML = `
      <div id="hud" style="width:100%;height:100%;pointer-events:none;font-family:cursive">
        <!-- Position badge -->
        <div id="hud-position" style="position:absolute;top:20px;left:20px;font-size:3em;color:#fff;
             text-shadow:2px 2px 0 #000;font-weight:bold">1st</div>

        <!-- Lap counter -->
        <div id="hud-lap" style="position:absolute;top:20px;right:20px;font-size:1.5em;color:#fff;
             text-shadow:1px 1px 0 #000">Lap 1/${TOTAL_LAPS}</div>

        <!-- Item slot -->
        <div id="hud-item" style="position:absolute;top:80px;right:20px;width:60px;height:60px;
             background:rgba(0,0,0,0.5);border-radius:10px;display:flex;align-items:center;
             justify-content:center;font-size:2em"></div>

        <!-- Butterfly counter -->
        <div id="hud-butterflies" style="position:absolute;top:20px;left:50%;transform:translateX(-50%);
             font-size:1.8em;color:#fff;text-shadow:2px 2px 0 #000">🦋 ×0</div>

        <!-- Timer -->
        <div id="hud-timer" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
             font-size:1.5em;color:#fff;text-shadow:1px 1px 0 #000">0:00.00</div>

        <!-- Drift tier indicator -->
        <div id="hud-drift" style="position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
             font-size:1.2em;color:#4488ff;text-shadow:1px 1px 0 #000;opacity:0"></div>

        <!-- Final lap banner -->
        <div id="hud-finallap" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);
             font-size:3em;color:#ffd700;text-shadow:3px 3px 0 #000;opacity:0;
             font-weight:bold;transition:opacity 0.3s">FINAL LAP!</div>

        <!-- Item toast -->
        <div id="hud-toast" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);
             font-size:2.5em;color:#fff;text-shadow:3px 3px 0 #000;opacity:0;
             transition:opacity 0.3s;pointer-events:none"></div>

        <!-- Minimap -->
        <canvas id="hud-minimap" width="150" height="150"
                style="position:absolute;bottom:20px;left:20px;border-radius:10px;
                       background:rgba(0,0,0,0.4)"></canvas>
      </div>
    `;
    this.hudEl = document.getElementById('hud') as HTMLDivElement;
  }

  private updateHud(data: RaceHudData): void {
    if (!this.hudEl) return;

    // Position
    const posEl = document.getElementById('hud-position');
    if (posEl) {
      const suffixes = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th'];
      posEl.textContent = `${data.position + 1}${suffixes[data.position]}`;
    }

    // Lap
    const lapEl = document.getElementById('hud-lap');
    if (lapEl) lapEl.textContent = `Lap ${Math.min(data.lap + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;

    // Item
    const itemEl = document.getElementById('hud-item');
    if (itemEl) {
      const icons: Record<string, string> = { gust: '💨', wobble: '🌀', turbo: '⚡' };
      itemEl.textContent = data.heldItem ? (icons[data.heldItem] ?? '?') : '';
    }

    // Butterflies
    const bflyEl = document.getElementById('hud-butterflies');
    if (bflyEl) bflyEl.textContent = `🦋 ×${data.butterflies}`;

    // Timer
    const timerEl = document.getElementById('hud-timer');
    if (timerEl) timerEl.textContent = formatTime(data.raceTime);

    // Drift tier
    const driftEl = document.getElementById('hud-drift');
    if (driftEl) {
      if (data.driftTier > 0) {
        const tierLabels = ['', '⚡', '⚡⚡', '⚡⚡⚡'];
        const tierColors = ['', '#4488ff', '#44ff88', '#ffdd44'];
        driftEl.textContent = tierLabels[data.driftTier];
        driftEl.style.color = tierColors[data.driftTier];
        driftEl.style.opacity = '1';
      } else if (data.isBoosting) {
        driftEl.textContent = '🚀 BOOST!';
        driftEl.style.color = '#ff8844';
        driftEl.style.opacity = '1';
      } else {
        driftEl.style.opacity = '0';
      }
    }

    // Final lap banner
    const finalEl = document.getElementById('hud-finallap');
    if (finalEl) {
      finalEl.style.opacity = data.lap === TOTAL_LAPS - 1 && data.raceTime % 4 < 2 ? '1' : '0';
    }

    // Item toast
    if (data.toast) {
      this.showToast(data.toast);
    }

    // Minimap
    this.drawMinimap(data);
  }

  private toastTimer = 0;

  private showToast(message: string): void {
    const el = document.getElementById('hud-toast');
    if (!el) return;
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }

  private drawMinimap(data: RaceHudData): void {
    const canvas = document.getElementById('hud-minimap') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 150, 150);

    // Draw track outline
    if (data.minimapPoints.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      for (let i = 0; i < data.minimapPoints.length; i++) {
        const p = data.minimapPoints[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Draw kart dots
    for (const dot of data.minimapDots) {
      ctx.fillStyle = dot.isHuman ? '#ffdd44' : '#ff6666';
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.isHuman ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Pause Menu ─────────────────────────────────────────
  private buildPauseMenu(): void {
    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;
                  background:rgba(0,0,0,0.7)">
        <h2 style="color:#fff;font-family:cursive;font-size:2.5em;margin-bottom:30px">⏸ Paused</h2>
        <button class="menu-btn" data-action="resume">▶ Resume</button>
        <button class="menu-btn" data-action="restart">🔄 Restart</button>
        <button class="menu-btn" data-action="quit">🚪 Quit</button>
      </div>
    `;
    this.bindButtons();
  }

  // ── Results ────────────────────────────────────────────
  private buildResults(data: RaceHudData): void {
    const standings = data.standings ?? [];
    // Sort by score (descending)
    const sorted = [...standings].sort((a, b) => b.score - a.score);

    const rows = sorted.map((s, i) => `
      <tr style="color:${s.isHuman ? '#ffd700' : '#fff'};font-size:${s.isHuman ? '1.3em' : '1em'}">
        <td style="padding:8px 15px">${i + 1}${['st','nd','rd','th','th','th','th','th'][i]}</td>
        <td style="padding:0 10px">${s.name}</td>
        <td style="padding:0 10px">${formatTime(s.time)}</td>
        <td style="padding:0 10px">🦋 ${s.butterflies}</td>
        <td style="padding:0 10px;font-weight:bold">${s.score} pts</td>
      </tr>
    `).join('');

    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;
                  background:linear-gradient(135deg,rgba(255,105,180,0.8),rgba(135,206,235,0.8))">
        <h2 style="color:#fff;font-family:cursive;font-size:2.5em;margin-bottom:20px;text-shadow:2px 2px 0 #c060a0">
          🏆 Race Complete! 🏆
        </h2>
        <table class="results-table" style="font-family:cursive;border-collapse:collapse;margin-bottom:30px">
          <tr style="color:#fff;opacity:0.7;font-size:0.9em">
            <th style="padding:4px 15px">#</th><th style="padding:4px 10px">Racer</th>
            <th style="padding:4px 10px">Time</th><th style="padding:4px 10px">🦋</th>
            <th style="padding:4px 10px">Score</th>
          </tr>
          ${rows}
        </table>
        <button class="menu-btn" data-action="restart">🔄 Race Again</button>
        <button class="menu-btn" data-action="quit">🏠 Main Menu</button>
      </div>
    `;
    this.bindButtons();
  }

  // ── Options ────────────────────────────────────────────
  private buildOptions(state: GameState): void {
    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;
                  background:rgba(0,0,0,0.7)">
        <h2 style="color:#fff;font-family:cursive;font-size:2em;margin-bottom:30px">⚙️ Options</h2>
        <div style="color:#fff;font-family:cursive;margin-bottom:15px">
          🎵 Music Volume: <input type="range" min="0" max="100" value="${state.musicVolume * 100}" data-action="music-volume" style="width:200px">
        </div>
        <div style="color:#fff;font-family:cursive;margin-bottom:30px">
          🔊 SFX Volume: <input type="range" min="0" max="100" value="${state.sfxVolume * 100}" data-action="sfx-volume" style="width:200px">
        </div>
        <button class="menu-btn" data-action="back-to-menu">← Back</button>
      </div>
    `;
    this.bindButtons();
  }

  // ── Event binding ──────────────────────────────────────
  private bindButtons(): void {
    this.overlay.querySelectorAll('[data-action]').forEach(el => {
      const action = el.getAttribute('data-action')!;
      const value = el.getAttribute('data-value');

      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') {
        el.addEventListener('input', () => {
          this.onAction(action, (el as HTMLInputElement).value);
        });
      } else if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox') {
        el.addEventListener('change', () => {
          this.onAction(action, (el as HTMLInputElement).checked);
        });
      } else {
        el.addEventListener('click', () => {
          // Toggle selection visually for cards without rebuilding the DOM
          if (el.classList.contains('card') && el.classList.contains('available') || el.closest('.card')) {
            const card = el.classList.contains('card') ? el : el.closest('.card')!;
            card.parentElement?.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
          }
          // Toggle active state for difficulty buttons
          if (el.classList.contains('diff-btn')) {
            el.parentElement?.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
          }
          this.onAction(action, value);
        });
      }
    });
  }
}

// ── Types for HUD data ───────────────────────────────────
export interface RaceHudData {
  position: number;
  lap: number;
  raceTime: number;
  heldItem: string | null;
  butterflies: number;
  driftTier: number;
  isBoosting: boolean;
  countdown?: number;
  toast?: string;
  minimapPoints: { x: number; y: number }[];
  minimapDots: { x: number; y: number; isHuman: boolean }[];
  standings?: { name: string; time: number; isHuman: boolean; butterflies: number; score: number }[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
