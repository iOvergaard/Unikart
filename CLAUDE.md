# Voxel Kart — Unicorns Collect Butterflies!

## What This Is

A browser-based 3D voxel kart racing game for Hannah (age 6). All 8 racers are unicorns who collect butterflies on the track for points. Dual scoring: race position bonus + butterfly count = combined score. Built with Three.js + TypeScript + Vite.

## Quick Start

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build → dist/
```

## Architecture Overview

```
src/main.ts                    ← Entry point, game loop, wires everything together
src/config/                    ← Pure data: constants, character stats, track layouts, items
src/core/                      ← Engine: event bus, input manager, game state machine
src/physics/                   ← Kart entity, drift-boost system, collision resolution
src/track/                     ← Catmull-Rom spline, procedural road mesh, track class
src/rendering/                 ← Three.js scene, voxel model builder, chase camera
src/ai/                        ← AI controller, difficulty profiles
src/gameplay/                  ← Race manager (orchestrator), item system, butterfly system
src/ui/                        ← DOM-based menus + HUD (ui-manager.ts)
```

### Key Systems & How They Connect

**Game Loop** (`main.ts`): `requestAnimationFrame` loop with fixed-timestep physics (60Hz via `FIXED_DT`). Input → Physics → Collision → Race progress → Items → Rendering → UI.

**State Machine** (`core/game-state.ts`): Screens are `main-menu → track-select → character-select → race-settings → countdown → racing → paused → results`. Transitions via `state.transition(screen)`.

**UI Manager** (`ui/ui-manager.ts`): Builds DOM for each screen. Takes an `onAction` callback for button clicks. **Important**: `show()` short-circuits if the screen hasn't changed (to preserve click handlers). Only `racing` and `countdown` get per-frame updates.

**Race Manager** (`gameplay/race-manager.ts`): Central orchestrator during a race. Owns all 8 `Kart` instances, AI controllers, item system, butterfly system. Called with `update(dt, humanInput)` each physics tick.

**Kart** (`physics/kart.ts`): Position, velocity, speed, rotation, drift state, item state, butterfly count, race progress. `updatePhysics()` takes raw inputs (accel/steer/drift) and applies arcade physics. Character stats (speed/accel/handling/weight on 1-6 scale) modify base physics constants.

**Track** (`track/track.ts`): Built from a `TrackDef` (control points + zones). Creates a `TrackSpline` (closed Catmull-Rom), generates procedural road mesh, barriers, ground. Provides `isOnRoad()`, `isInZone()`, `getBarrierPush()` queries.

**Drift-Boost** (`physics/drift-boost.ts`): State machine: `idle → charging → boosting → cooldown`. Tier thresholds at 0.35s/0.7s/1.05s of charge time. Boost durations: Tier 1 = 0.7s, Tier 2 = 1.1s, Tier 3 = 1.5s. All at 1.35× speed multiplier. Drift zones charge 1.5× faster.

**AI** (`ai/ai-controller.ts`): Spline-following with lane offsets. Decides steering, drift timing, item usage every ~0.3-0.7s. Personality from character's `aiTendency` (aggressive, drift-happy, defensive, item-focused, smooth, balanced, pusher). Difficulty from `ai/difficulty.ts` profiles.

**Collision** (`physics/collision.ts`): Kart↔barrier (gentle push-back, never stop dead) and kart↔kart (weight-based separation, gentle bumps). Called once per physics frame.

**Items** (`gameplay/item-system.ts`): 3 items with position-weighted rolls. Gust = 0.6s steering lock, Wobble = 1.2s at 50% speed, Turbo = 1.5s self-boost. One-item capacity.

**Voxel Models** (`rendering/voxel-models.ts`): Characters built from arrays of `{x,y,z,color}` voxels. Merged into single `BufferGeometry` per character (one draw call). Kart body + unicorn rider (horn + mane with per-character colours). Also builds butterfly collectible meshes.

**Butterfly System** (`gameplay/butterfly-system.ts`): Manages butterfly collectibles on the track. Spawns 9 initial clusters of 4 butterflies each, plus new clusters every 3-5s. Collection radius 3 units — all karts (human + AI) collect. Scoring: position bonus (1st=10..8th=0) + butterfly count = combined score.

### Data Flow During a Race Frame

```
1. input.update()                    — poll keyboard/gamepad
2. race.update(FIXED_DT, input)      — one physics tick:
   a. Human kart: updatePhysics(accel, steer, drift, onRoad, inDriftZone)
   b. AI karts: aiController.update() → simulated inputs → updatePhysics()
   c. resolveCollisions(karts, track)
   d. Update race progress (spline parameter → lap detection)
   e. Item pickups (zone check → weighted roll)
   f. Butterfly collection (proximity check → kart.butterflies++)
3. scene: add/remove butterfly meshes, animate butterflies
4. scene.updateFrame(karts, humanKart, dt) — sync meshes, camera, particles
4. scene.render()                    — Three.js draw call
5. ui.show(screen, state, hudData)   — update HUD numbers (or rebuild if screen changed)
```

## The 8 Unicorns

| Name | Speed | Accel | Handling | Weight | AI Tendency | Horn | Mane |
|------|-------|-------|----------|--------|-------------|------|------|
| Sparkle | 4 | 5 | 4 | 3 | Smooth | Gold | Deep pink |
| Zephyr | 6 | 3 | 5 | 2 | Drift-happy | Periwinkle | Blue |
| Glimmer | 6 | 4 | 3 | 5 | Aggressive | Light blue | Violet |
| Clover | 3 | 6 | 5 | 2 | Item-focused | Green | Forest |
| Aurora | 5 | 4 | 4 | 4 | Defensive | Pink | Purple |
| Nimbus | 5 | 5 | 3 | 3 | Balanced | Yellow | Orange |
| Blossom | 4 | 5 | 5 | 3 | Item-focused | Pink | Deep pink |
| Vortex | 5 | 3 | 4 | 6 | Pusher | Lavender | Indigo |

Stats are 1-6. Converted to physics multipliers in `Kart` constructor: `BASE_VALUE * (0.7 + stat * 0.1)`.

## The 3 Items

| Item | Target | Effect | Duration | Back-weight |
|------|--------|--------|----------|-------------|
| Gust Spin | Opponent ahead | Steering locked, visual spin | 0.6s | 1 (common) |
| Wobble | Opponent ahead | 50% max speed | 1.2s | 2 (medium) |
| Turbo Gift | Self | 1.35× speed boost | 1.5s | 3 (back-of-pack) |

Position-weighted distribution: last place gets ~3× more Turbo Gifts than first place.

## Butterfly Collectibles

Butterflies are the main collectible. They spawn as clusters of 4 along the road.

- **Initial spawn**: 9 clusters evenly spaced around the track at race start
- **Periodic spawn**: New cluster every 3-5 seconds at a random road position
- **Collection**: Drive within 3 units to collect. Both human and AI karts collect.
- **Visual**: Small pastel-coloured voxel butterflies floating at y=1.5 with bob + wing-flap animation

### Scoring

| Position | Bonus |
|----------|-------|
| 1st | 10 |
| 2nd | 7 |
| 3rd | 5 |
| 4th | 4 |
| 5th | 3 |
| 6th | 2 |
| 7th | 1 |
| 8th | 0 |

**Final score = position bonus + butterflies collected.** Results screen sorts by score.

## Track: Rainbow Meadow

12 control points forming a closed Catmull-Rom spline. ~1.2km loop. 4 sections: flower straightaway → right curve → back straight → left sweeper (drift zone) → castle hill → wide finish approach. Road width 18-22 units. Rainbow-coloured barriers. Drift zone from t=0.5 to t=0.7. Item zones at t≈0.08, 0.38, 0.83.

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Accelerate | ↑ / W | A button |
| Brake/Reverse | ↓ / S | B button |
| Steer | ← → / A D | Left stick |
| Drift | Space | RB / RT |
| Use Item | Shift / X | LB / LT |
| Pause | Escape / P | Start |

## Known Issues & What Needs Work

### Bugs to Fix
- **Menu re-selection**: `select-track` and `select-character` actions call `state.transition()` to re-render, but since the `show()` short-circuit now prevents re-render on same screen, selecting a different track/character won't visually update. Fix: add a `forceRedraw()` method or track selection state separately.
- **Countdown screen**: rebuilds every frame (intended for countdown timer), but this is slightly wasteful. Could use a targeted DOM update instead.
- **worldToMinimap**: recomputes bounding box every frame per kart. Should cache the bounds like `computeMinimapPoints` does.

### Not Yet Implemented (Phase 8: Audio & Polish)
- **Audio**: No sounds at all currently. Need:
  - Engine hum (pitch-shifted by speed)
  - Drift charge sound (escalating pitch for tier 1→2→3)
  - Boost release whoosh
  - Item pickup ding
  - Item hit effects (gust whoosh, wobble buzz)
  - Wall/kart bump sound
  - UI click sounds
  - One music loop per track (can use Tone.js for procedural or a royalty-free loop)
- **VFX Polish**: Drift particles exist but are basic. Need:
  - Better boost speed lines
  - Item hit visual effects (gust = dust cloud, wobble = shake, turbo = glow)
  - Lap banner animation (currently just opacity toggle)
  - Camera shake on collision/item hit
- **Scene cleanup in `endRace()`**: Now tracks all race objects (scenery, track, butterflies) in `raceObjects[]` and removes them on cleanup. Should be tested for leaks on repeated races.

### Not Yet Implemented (from original spec)

| What | Status | Where to implement | Notes |
|------|--------|-------------------|-------|
| **7 more tracks** | Stubs exist | `config/tracks.ts` | Track system is generic — add `controlPoints` + `zones` per track |
| **5 more items** | 3 of 8 built | `config/items.ts` + `gameplay/item-system.ts` | Need 5 new effects. Max stun ≤1.2s, max steer-lock ≤0.6s |
| **Lap splits** | Data tracked, not displayed | `ui/ui-manager.ts` | `Kart.lapTimes[]` already exists, just needs HUD display |
| **AI multi-lane racing** | Basic spline-follow only | `ai/ai-controller.ts` | Needs variation splines, lane offsets for clean overtakes |
| **AI hazard avoidance** | Not implemented | `ai/ai-controller.ts` | Dodge obstacles, avoid off-road |
| **Butterfly collection sparkle** | Butterflies just disappear | `rendering/scene-manager.ts` | Brief particle burst on collect |

## Design Principles
- **6-year-old friendly**: fast but readable speed, forgiving wall physics (bounce, never stop), mild item effects (max stun 1.2s), bright colours
- **Drift is the main skill**: easy to start (hold space), rewarding to master (tier 3 = long boost)
- **Goofy chaos, not frustration**: items create fun moments, not rage quits
- **Wide roads**: enable pack racing and clean overtakes
- **Arcade physics**: no realistic simulation, everything tuned for feel

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.ts` | 285 | Entry point, game loop, UI wiring |
| `src/config/constants.ts` | 48 | All physics/game tuning values |
| `src/config/characters.ts` | 103 | 8 unicorn character definitions |
| `src/config/items.ts` | 67 | 3 item definitions + roll logic |
| `src/config/tracks.ts` | 90 | Track definitions (1 built, 7 stubs) |
| `src/core/event-bus.ts` | 22 | Simple pub/sub |
| `src/core/input-manager.ts` | 79 | Keyboard + gamepad input |
| `src/core/game-state.ts` | 37 | State machine + race settings |
| `src/physics/kart.ts` | 218 | Kart entity + physics + butterfly count |
| `src/physics/drift-boost.ts` | 89 | Drift charge/boost state machine |
| `src/physics/collision.ts` | 62 | Collision detection + response |
| `src/track/spline.ts` | 82 | Catmull-Rom spline utilities |
| `src/track/track.ts` | 180 | Track class (mesh gen, queries) |
| `src/rendering/scene-manager.ts` | 340 | Three.js scene, camera, particles, butterflies |
| `src/rendering/voxel-models.ts` | 191 | Unicorn + butterfly model builder |
| `src/ai/ai-controller.ts` | 140 | AI driving logic |
| `src/ai/difficulty.ts` | 42 | Chill/Standard/Mean profiles |
| `src/gameplay/race-manager.ts` | 206 | Race orchestration |
| `src/gameplay/butterfly-system.ts` | 101 | Butterfly spawning, collection, scoring |
| `src/gameplay/item-system.ts` | 80 | Item pickup/usage/effects |
| `src/ui/ui-manager.ts` | 462 | All UI screens + HUD + butterfly counter |
