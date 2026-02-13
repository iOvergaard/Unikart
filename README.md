# Unikart

A browser-based 3D voxel kart racing game built with Three.js, TypeScript and Vite. Eight unicorns race around Rainbow Meadow collecting butterflies for points.

Made for Hannah (age 6).

## Getting Started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
```

## How It Works

Race 3 laps around the track. Your final score combines race position bonus with butterflies collected:

| Position | Bonus |
|----------|-------|
| 1st | 10 |
| 2nd | 7 |
| 3rd | 5 |
| 4th-8th | 4, 3, 2, 1, 0 |

Drive through floating butterflies to collect them. Pick up rainbow gift boxes for items (Gust Spin, Wobble, Turbo Gift). Hold drift to charge a speed boost (3 tiers).

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Accelerate | W / Arrow Up | A button |
| Brake | S / Arrow Down | B button |
| Steer | A D / Arrow Left Right | Left stick |
| Drift | Space | RB / RT |
| Use Item | Shift / X | LB / LT |
| Pause | Escape / P | Start |

## The Unicorns

| Name | Speed | Accel | Handling | Weight |
|------|-------|-------|----------|--------|
| Sparkle | 4 | 5 | 4 | 3 |
| Zephyr | 6 | 3 | 5 | 2 |
| Glimmer | 6 | 4 | 3 | 5 |
| Clover | 3 | 6 | 5 | 2 |
| Aurora | 5 | 4 | 4 | 4 |
| Nimbus | 5 | 5 | 3 | 3 |
| Blossom | 4 | 5 | 5 | 3 |
| Vortex | 5 | 3 | 4 | 6 |

## Tech Stack

- **Three.js** - 3D rendering with voxel models
- **TypeScript** - type-safe game logic
- **Vite** - dev server and bundling
