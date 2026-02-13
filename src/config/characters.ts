export interface CharacterDef {
  id: string;
  name: string;
  type: 'unicorn';
  /** 1-6 scale */
  speed: number;
  accel: number;
  handling: number;
  weight: number;
  aiTendency: AiTendency;
  /** Primary colour (hex) */
  color: number;
  /** Secondary colour (hex) */
  accentColor: number;
  /** Horn colour (hex) */
  hornColor: number;
  /** Mane colour (hex) */
  maneColor: number;
}

export type AiTendency =
  | 'smooth'
  | 'drift-happy'
  | 'aggressive'
  | 'item-focused'
  | 'defensive'
  | 'balanced'
  | 'pusher';

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'sparkle',
    name: 'Sparkle',
    type: 'unicorn',
    speed: 4, accel: 5, handling: 4, weight: 3,
    aiTendency: 'smooth',
    color: 0xff69b4, accentColor: 0xffd700,
    hornColor: 0xffd700, maneColor: 0xff1493,
  },
  {
    id: 'zephyr',
    name: 'Zephyr',
    type: 'unicorn',
    speed: 6, accel: 3, handling: 5, weight: 2,
    aiTendency: 'drift-happy',
    color: 0x87ceeb, accentColor: 0xe0ffff,
    hornColor: 0xc0c0ff, maneColor: 0x4488ff,
  },
  {
    id: 'glimmer',
    name: 'Glimmer',
    type: 'unicorn',
    speed: 6, accel: 4, handling: 3, weight: 5,
    aiTendency: 'aggressive',
    color: 0xc0c0ff, accentColor: 0xffffff,
    hornColor: 0xe0e0ff, maneColor: 0x8888ff,
  },
  {
    id: 'clover',
    name: 'Clover',
    type: 'unicorn',
    speed: 3, accel: 6, handling: 5, weight: 2,
    aiTendency: 'item-focused',
    color: 0x90ee90, accentColor: 0xffff00,
    hornColor: 0x44ff88, maneColor: 0x228b22,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    type: 'unicorn',
    speed: 5, accel: 4, handling: 4, weight: 4,
    aiTendency: 'defensive',
    color: 0xda70d6, accentColor: 0xff1493,
    hornColor: 0xff69b4, maneColor: 0x9932cc,
  },
  {
    id: 'nimbus',
    name: 'Nimbus',
    type: 'unicorn',
    speed: 5, accel: 5, handling: 3, weight: 3,
    aiTendency: 'balanced',
    color: 0xfffacd, accentColor: 0xffa500,
    hornColor: 0xffdd44, maneColor: 0xff8c00,
  },
  {
    id: 'blossom',
    name: 'Blossom',
    type: 'unicorn',
    speed: 4, accel: 5, handling: 5, weight: 3,
    aiTendency: 'item-focused',
    color: 0xffb6c1, accentColor: 0xff69b4,
    hornColor: 0xffc0cb, maneColor: 0xff1493,
  },
  {
    id: 'vortex',
    name: 'Vortex',
    type: 'unicorn',
    speed: 5, accel: 3, handling: 4, weight: 6,
    aiTendency: 'pusher',
    color: 0x9370db, accentColor: 0x4b0082,
    hornColor: 0xb080ff, maneColor: 0x4b0082,
  },
];
