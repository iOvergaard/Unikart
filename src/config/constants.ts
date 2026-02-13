// ── Physics ──────────────────────────────────────────────
export const FIXED_DT = 1 / 60;
export const GRAVITY = -20;

// Kart base values (modified by character stats)
export const BASE_MAX_SPEED = 45;
export const BASE_ACCELERATION = 28;
export const BASE_BRAKE_FORCE = 40;
export const BASE_STEERING_SPEED = 2.8;
export const BASE_FRICTION = 0.97;
export const BASE_WEIGHT = 1.0;

// Off-road
export const OFFROAD_SPEED_MULTIPLIER = 0.5;
export const OFFROAD_DURING_BOOST_MULTIPLIER = 0.75; // 50% less penalty

// Collision
export const WALL_BOUNCE_FACTOR = 0.3;     // How much speed preserved on wall hit
export const WALL_PUSH_FORCE = 8;           // Gentle push away from wall
export const KART_BOUNCE_FACTOR = 0.2;      // Kart-to-kart collision
export const KART_COLLISION_RADIUS = 1.8;

// ── Drift-Boost ──────────────────────────────────────────
export const DRIFT_TIER_THRESHOLDS = [0.35, 0.7, 1.05]; // seconds to reach each tier
export const DRIFT_BOOST_DURATIONS = [0, 0.7, 1.1, 1.5]; // tier 0/1/2/3
export const DRIFT_BOOST_MULTIPLIER = 1.35;
export const DRIFT_ZONE_CHARGE_MULTIPLIER = 1.5;
export const DRIFT_STEERING_MULTIPLIER = 1.2;
export const DRIFT_FRICTION_MULTIPLIER = 0.6;
export const DRIFT_COOLDOWN = 0.15;

// ── Items ────────────────────────────────────────────────
export const ITEM_GUST_STEER_LOCK = 0.6;     // seconds
export const ITEM_WOBBLE_DURATION = 1.2;      // seconds
export const ITEM_WOBBLE_SPEED_MULT = 0.5;
export const ITEM_TURBO_DURATION = 2.5;       // seconds
export const ITEM_TURBO_MULTIPLIER = 2.5;

// ── Race ─────────────────────────────────────────────────
export const TOTAL_LAPS = 3;
export const TOTAL_RACERS = 8;
export const COUNTDOWN_DURATION = 3; // seconds

// ── Track ────────────────────────────────────────────────
export const ROAD_WIDTH = 18;       // wide enough for side-by-side racing
export const ROAD_SEGMENTS = 200;   // resolution of road mesh

// ── Obstacles ──────────────────────────────────────────────
// Gate
export const GATE_PILLAR_WIDTH = 1.5;
export const GATE_PILLAR_HEIGHT = 4;
export const GATE_HIT_SPEED_FACTOR = 0.4;        // keep 40% speed
export const GATE_HIT_PUSH_FORCE = 10;
export const GATE_BOOST_DURATION = 0.8;
export const GATE_COLLISION_DEPTH = 1.5;

// Hammer
export const HAMMER_HEAD_RADIUS = 2.0;
export const HAMMER_SWING_PERIOD = 3.0;           // seconds per full cycle
export const HAMMER_KNOCKBACK_SPEED = 25;
export const HAMMER_KNOCKBACK_DECAY = 0.92;       // per-frame at 60Hz
export const HAMMER_HIT_SPEED_FACTOR = 0.2;       // keep 20% speed
export const HAMMER_STUN_DURATION = 0.8;
export const HAMMER_POLE_HEIGHT = 6;
export const HAMMER_ARM_LENGTH = 8;

// ── Rendering ────────────────────────────────────────────
export const VOXEL_SIZE = 0.3;
export const CAMERA_DISTANCE = 12;
export const CAMERA_HEIGHT = 6;
export const CAMERA_LERP = 4;       // how quickly camera follows

// ── Audio ────────────────────────────────────────────────
export const ENGINE_BASE_FREQ = 80;
export const ENGINE_MAX_FREQ = 400;
export const DRIFT_CHARGE_FREQS = [220, 330, 440]; // tier 1, 2, 3
