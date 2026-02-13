import * as THREE from 'three';
import { ObstacleDef } from './obstacles';

export interface TrackControlPoint {
  position: THREE.Vector3;
  width: number;
}

export interface TrackZone {
  /** Parameter range along spline [0..1] */
  start: number;
  end: number;
  type: 'drift' | 'item';
}

export interface SceneryZone {
  start: number;
  end: number;
  type: 'forest';
}

export interface TrackDef {
  id: string;
  name: string;
  description: string;
  controlPoints: TrackControlPoint[];
  zones: TrackZone[];
  sceneryZones?: SceneryZone[];
  obstacles?: ObstacleDef[];
  available: boolean;
}

/**
 * Rainbow Meadow — the first track.
 * A friendly loop with gentle curves, one tight turn, and a wide finish straight.
 * Designed to teach drifting while being forgiving for 6-year-olds.
 */
function rainbowMeadow(): TrackDef {
  const cp = (x: number, z: number, w: number = 18) => ({
    position: new THREE.Vector3(x, 0, z),
    width: w,
  });

  return {
    id: 'rainbow-meadow',
    name: 'Rainbow Meadow',
    description: 'A sunny meadow with gentle hills and flowers!',
    controlPoints: [
      // Start/finish straight
      cp(0, 0),
      cp(40, 0),
      cp(80, 0, 20),      // slight widening before turn
      // Right curve
      cp(110, -20),
      cp(120, -60),
      // Back straight with slight bend
      cp(100, -100),
      cp(60, -120),
      // Left sweeper (drift zone)
      cp(10, -110, 20),
      cp(-20, -80),
      // Castle hill section
      cp(-30, -40),
      cp(-20, -10, 22),   // wide finish approach
      cp(-10, 0, 22),
    ],
    zones: [
      // Drift zone through the left sweeper
      { start: 0.5, end: 0.7, type: 'drift' },
      // Item pickups on the straights (wide zones so boxes are easy to hit)
      { start: 0.02, end: 0.15, type: 'item' },
      { start: 0.32, end: 0.45, type: 'item' },
      { start: 0.77, end: 0.90, type: 'item' },
    ],
    sceneryZones: [
      // Dense forest after the drift zone, before the wide finish approach
      { start: 0.72, end: 0.88, type: 'forest' },
    ],
    obstacles: [
      { type: 'gate', t: 0.25, boostSlot: Math.floor(Math.random() * 3) },
      { type: 'hammer', t: 0.47 },
    ],
    available: true,
  };
}

export const TRACKS: TrackDef[] = [
  rainbowMeadow(),
  {
    id: 'crystal-caves', name: 'Crystal Caves',
    description: 'Sparkling underground caverns!',
    controlPoints: [], zones: [], available: false,
  },
  {
    id: 'cloud-kingdom', name: 'Cloud Kingdom',
    description: 'Race above the clouds!',
    controlPoints: [], zones: [], available: false,
  },
  {
    id: 'enchanted-forest', name: 'Enchanted Forest',
    description: 'Ancient trees and fairy lights!',
    controlPoints: [], zones: [], available: false,
  },
  {
    id: 'candy-coast', name: 'Candy Coast',
    description: 'Sweet treats by the ocean!',
    controlPoints: [], zones: [], available: false,
  },
  {
    id: 'starlight-summit', name: 'Starlight Summit',
    description: 'A mountain under the stars!',
    controlPoints: [], zones: [], available: false,
  },
  {
    id: 'blossom-bridge', name: 'Blossom Bridge',
    description: 'Cherry blossoms over a river!',
    controlPoints: [], zones: [], available: false,
  },
  {
    id: 'volcano-valley', name: 'Volcano Valley',
    description: 'Warm lava and sparkly gems!',
    controlPoints: [], zones: [], available: false,
  },
];
