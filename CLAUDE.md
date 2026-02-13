# Voxel Kart — Butterflies & Unicorns Racing

## What This Is

A browser-based 3D voxel kart racing game for Hannah (age 6). Theme: butterflies and unicorns. Built with Three.js + TypeScript + Vite.

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
src/gameplay/                  ← Race manager (orchestrator), item system
src/ui/                        ← DOM-based menus + HUD (ui-manager.ts)
```

### Key Systems & How They Connect

**Game Loop** (`main.ts`): `requestAnimationFrame` loop with fixed-timestep physics (60Hz via `FIXED_DT`). Input → Physics → Collision → Race progress → Items → Rendering → UI.

**State Machine** (`core/game-state.ts`): Screens are `main-menu → track-select → character-select → race-settings → countdown → racing → paused → results`. Transitions via `state.transition(screen)`.

**UI Manager** (`ui/ui-manager.ts`): Builds DOM for each screen. Takes an `onAction` callback for button clicks. **Important**: `show()` short-circuits if the screen hasn't changed (to preserve click handlers). Only `racing` and `countdown` get per-frame updates.

**Race Manager** (`gameplay/race-manager.ts`): Central orchestrator during a race. Owns all 8 `Kart` instances, AI controllers, item system. Called with `update(dt, humanInput)` each physics tick.

**Kart** (`physics/kart.ts`): Position, velocity, speed, rotation, drift state, item state, race progress. `updatePhysics()` takes raw inputs (accel/steer/drift) and applies arcade physics. Character stats (speed/accel/handling/weight on 1-6 scale) modify base physics constants.

**Track** (`track/track.ts`): Built from a `TrackDef` (control points + zones). Creates a `TrackSpline` (closed Catmull-Rom), generates procedural road mesh, barriers, ground. Provides `isOnRoad()`, `isInZone()`, `getBarrierPush()` queries.

**Drift-Boost** (`physics/drift-boost.ts`): State machine: `idle → charging → boosting → cooldown`. Tier thresholds at 0.35s/0.7s/1.05s of charge time. Boost durations: Tier 1 = 0.7s, Tier 2 = 1.1s, Tier 3 = 1.5s. All at 1.35× speed multiplier. Drift zones charge 1.5× faster.

**AI** (`ai/ai-controller.ts`): Spline-following with lane offsets. Decides steering, drift timing, item usage every ~0.3-0.7s. Personality from character's `aiTendency` (aggressive, drift-happy, defensive, item-focused, smooth, balanced, pusher). Difficulty from `ai/difficulty.ts` profiles.

**Collision** (`physics/collision.ts`): Kart↔barrier (gentle push-back, never stop dead) and kart↔kart (weight-based separation, gentle bumps). Called once per physics frame.

**Items** (`gameplay/item-system.ts`): 3 items with position-weighted rolls. Gust = 0.6s steering lock, Wobble = 1.2s at 50% speed, Turbo = 1.5s self-boost. One-item capacity.

**Voxel Models** (`rendering/voxel-models.ts`): Characters built from arrays of `{x,y,z,color}` voxels. Merged into single `BufferGeometry` per character (one draw call). Kart body + rider (butterfly wings / unicorn horn / fairy tiara).

### Data Flow During a Race Frame

```
1. input.update()                    — poll keyboard/gamepad
2. race.update(FIXED_DT, input)      — one physics tick:
   a. Human kart: updatePhysics(accel, steer, drift, onRoad, inDriftZone)
   b. AI karts: aiController.update() → simulated inputs → updatePhysics()
   c. resolveCollisions(karts, track)
   d. Update race progress (spline parameter → lap detection)
   e. Item pickups (zone check → weighted roll)
3. scene.updateFrame(karts, humanKart, dt) — sync meshes, camera, particles
4. scene.render()                    — Three.js draw call
5. ui.show(screen, state, hudData)   — update HUD numbers (or rebuild if screen changed)
```

## The 8 Characters

| Name | Type | Speed | Accel | Handling | Weight | AI Tendency |
|------|------|-------|-------|----------|--------|-------------|
| Sparkle | Butterfly | 4 | 5 | 4 | 3 | Smooth |
| Zephyr | Butterfly | 6 | 3 | 5 | 2 | Drift-happy |
| Glimmer | Unicorn | 6 | 4 | 3 | 5 | Aggressive |
| Clover | Fairy | 3 | 6 | 5 | 2 | Item-focused |
| Aurora | Butterfly | 5 | 4 | 4 | 4 | Defensive |
| Nimbus | Fairy | 5 | 5 | 3 | 3 | Balanced |
| Blossom | Unicorn | 4 | 5 | 5 | 3 | Item-focused |
| Vortex | Butterfly | 5 | 3 | 4 | 6 | Pusher |

Stats are 1-6. Converted to physics multipliers in `Kart` constructor: `BASE_VALUE * (0.7 + stat * 0.1)`.

## The 3 Items

| Item | Target | Effect | Duration | Back-weight |
|------|--------|--------|----------|-------------|
| Gust Spin | Opponent ahead | Steering locked, visual spin | 0.6s | 1 (common) |
| Wobble | Opponent ahead | 50% max speed | 1.2s | 2 (medium) |
| Turbo Gift | Self | 1.35× speed boost | 1.5s | 3 (back-of-pack) |

Position-weighted distribution: last place gets ~3× more Turbo Gifts than first place.

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
- **Scene cleanup in `endRace()`**: Currently removes kart meshes and item boxes, but scenery (flowers, trees) and track meshes persist. Need to track and remove all race-specific scene objects.

### Future: Remaining 7 Tracks
Each track is a `TrackDef` in `config/tracks.ts` — just needs `controlPoints` and `zones` filled in. The track system is fully generic. Add control points and you get a new track.

### Future: Remaining 5 Items
Item system supports any number of items. Add to `config/items.ts` array + implement effect in `gameplay/item-system.ts`.

## Design Principles
- **6-year-old friendly**: fast but readable speed, forgiving wall physics (bounce, never stop), mild item effects (max stun 1.2s), bright colours
- **Drift is the main skill**: easy to start (hold space), rewarding to master (tier 3 = long boost)
- **Goofy chaos, not frustration**: items create fun moments, not rage quits
- **Wide roads**: enable pack racing and clean overtakes
- **Arcade physics**: no realistic simulation, everything tuned for feel

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.ts` | 281 | Entry point, game loop, UI wiring |
| `src/config/constants.ts` | 48 | All physics/game tuning values |
| `src/config/characters.ts` | 84 | 8 character definitions |
| `src/config/items.ts` | 67 | 3 item definitions + roll logic |
| `src/config/tracks.ts` | 90 | Track definitions (1 built, 7 stubs) |
| `src/core/event-bus.ts` | 22 | Simple pub/sub |
| `src/core/input-manager.ts` | 79 | Keyboard + gamepad input |
| `src/core/game-state.ts` | 37 | State machine + race settings |
| `src/physics/kart.ts` | 167 | Kart entity + physics |
| `src/physics/drift-boost.ts` | 89 | Drift charge/boost state machine |
| `src/physics/collision.ts` | 62 | Collision detection + response |
| `src/track/spline.ts` | 82 | Catmull-Rom spline utilities |
| `src/track/track.ts` | 180 | Track class (mesh gen, queries) |
| `src/rendering/scene-manager.ts` | 215 | Three.js scene, camera, particles |
| `src/rendering/voxel-models.ts` | 170 | Character model builder |
| `src/ai/ai-controller.ts` | 140 | AI driving logic |
| `src/ai/difficulty.ts` | 42 | Chill/Standard/Mean profiles |
| `src/gameplay/race-manager.ts` | 175 | Race orchestration |
| `src/gameplay/item-system.ts` | 80 | Item pickup/usage/effects |
| `src/ui/ui-manager.ts` | 340 | All UI screens + HUD |
