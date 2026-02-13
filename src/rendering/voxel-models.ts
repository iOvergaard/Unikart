import * as THREE from 'three';
import { VOXEL_SIZE, GATE_PILLAR_WIDTH, GATE_PILLAR_HEIGHT } from '../config/constants';
import { CharacterDef } from '../config/characters';

interface Voxel {
  x: number; y: number; z: number;
  color: number;
}

/** Build a merged mesh from a voxel array */
function buildVoxelMesh(voxels: Voxel[]): THREE.Mesh {
  const geo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
  const mergedGeos: THREE.BufferGeometry[] = [];

  for (const v of voxels) {
    const g = geo.clone();
    g.translate(v.x * VOXEL_SIZE, v.y * VOXEL_SIZE, v.z * VOXEL_SIZE);

    // Bake colour into vertex colours
    const col = new THREE.Color(v.color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = col.r;
      colors[i + 1] = col.g;
      colors[i + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    mergedGeos.push(g);
  }

  const merged = mergeBufferGeometries(mergedGeos);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.Mesh(merged, mat);
}

/** Simple geometry merge (replaces three's deprecated utility) */
function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geos) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const col = geo.attributes.color;
    const idx = geo.index;

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (norm) normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      if (col) colors.push(col.getX(i), col.getY(i), col.getZ(i));
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push((idx.array as Uint16Array | Uint32Array)[i] + vertexOffset);
      }
    }

    vertexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (colors.length) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (indices.length) merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

// ── Character voxel definitions ──

/** Generate a simple kart body (shared base) */
function kartBody(bodyColor: number): Voxel[] {
  const voxels: Voxel[] = [];
  const c = bodyColor;
  const dark = new THREE.Color(bodyColor).multiplyScalar(0.7).getHex();
  const wheel = 0x333333;

  // Body: 5 wide, 2 tall, 7 long
  for (let x = -2; x <= 2; x++) {
    for (let z = -3; z <= 3; z++) {
      voxels.push({ x, y: 1, z, color: c });
    }
  }
  // Nose
  for (let x = -1; x <= 1; x++) {
    voxels.push({ x, y: 1, z: 4, color: dark });
  }
  // Seat back
  for (let x = -1; x <= 1; x++) {
    voxels.push({ x, y: 2, z: -2, color: dark });
    voxels.push({ x, y: 3, z: -2, color: dark });
  }
  // Wheels
  for (const wx of [-2, 2]) {
    for (const wz of [-2, 3]) {
      voxels.push({ x: wx, y: 0, z: wz, color: wheel });
    }
  }
  return voxels;
}

/** Build a smooth-geometry unicorn rider (spheres, cylinders, cones) */
function buildUnicornRider(hornColor: number, maneColor: number): THREE.Group {
  const group = new THREE.Group();

  // Shared materials
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const hoofMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const eyeHighlightMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const snoutMat = new THREE.MeshLambertMaterial({ color: 0xffcccc });
  const hornMat = new THREE.MeshLambertMaterial({ color: hornColor });
  const maneMat = new THREE.MeshLambertMaterial({ color: maneColor });

  // ── Body (main torso — slightly elongated sphere) ──
  const bodyGeo = new THREE.SphereGeometry(0.45, 12, 10);
  const body = new THREE.Mesh(bodyGeo, whiteMat);
  body.scale.set(1, 0.85, 1.25);
  body.position.set(0, 1.0, 0.1);
  group.add(body);

  // Rump (behind torso)
  const rumpGeo = new THREE.SphereGeometry(0.38, 10, 8);
  const rump = new THREE.Mesh(rumpGeo, whiteMat);
  rump.position.set(0, 0.9, -0.4);
  group.add(rump);

  // ── Legs ──
  const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.5, 6);
  const hoofGeo = new THREE.SphereGeometry(0.07, 6, 4);

  // Front legs (angled slightly forward)
  for (const side of [-1, 1]) {
    const fl = new THREE.Mesh(legGeo, whiteMat);
    fl.position.set(side * 0.22, 0.58, 0.4);
    fl.rotation.x = 0.25;
    group.add(fl);
  }
  // Back legs (angled slightly back)
  for (const side of [-1, 1]) {
    const bl = new THREE.Mesh(legGeo, whiteMat);
    bl.position.set(side * 0.2, 0.52, -0.6);
    bl.rotation.x = -0.2;
    group.add(bl);
  }

  // Hooves
  const hoofPositions = [
    { x: -0.22, y: 0.3, z: 0.47 },
    { x: 0.22, y: 0.3, z: 0.47 },
    { x: -0.2, y: 0.3, z: -0.65 },
    { x: 0.2, y: 0.3, z: -0.65 },
  ];
  for (const p of hoofPositions) {
    const hoof = new THREE.Mesh(hoofGeo, hoofMat);
    hoof.position.set(p.x, p.y, p.z);
    group.add(hoof);
  }

  // ── Neck (cylinder tilted forward ~40°) ──
  const neckGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.6, 8);
  const neck = new THREE.Mesh(neckGeo, whiteMat);
  neck.position.set(0, 1.38, 0.35);
  neck.rotation.x = -0.7;
  group.add(neck);

  // ── Head (slightly elongated on z for a horse-like shape) ──
  const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const head = new THREE.Mesh(headGeo, whiteMat);
  head.scale.set(1, 1, 1.3);
  head.position.set(0, 1.72, 0.6);
  group.add(head);

  // Snout (soft pink)
  const snoutGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const snout = new THREE.Mesh(snoutGeo, snoutMat);
  snout.position.set(0, 1.66, 0.9);
  group.add(snout);

  // ── Eyes ──
  const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
  const highlightGeo = new THREE.SphereGeometry(0.02, 4, 3);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.18, 1.79, 0.78);
    group.add(eye);
    const hl = new THREE.Mesh(highlightGeo, eyeHighlightMat);
    hl.position.set(side * 0.2, 1.81, 0.8);
    group.add(hl);
  }

  // ── Ears (small cones, angled outward) ──
  const earGeo = new THREE.ConeGeometry(0.07, 0.18, 6);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, whiteMat);
    ear.position.set(side * 0.15, 1.98, 0.55);
    ear.rotation.z = side * 0.3;
    group.add(ear);
  }

  // ── Horn (cone from forehead, tilted up-forward) ──
  const hornGeo = new THREE.ConeGeometry(0.06, 0.5, 8);
  const horn = new THREE.Mesh(hornGeo, hornMat);
  horn.position.set(0, 2.12, 0.68);
  horn.rotation.x = -0.4;
  group.add(horn);

  // ── Mane (flattened spheres from head down along neck) ──
  const maneGeo = new THREE.SphereGeometry(0.12, 6, 4);
  const manePoints = [
    { y: 1.92, z: 0.45, sx: 1.4, sy: 0.7, sz: 1.0 },
    { y: 1.82, z: 0.35, sx: 1.3, sy: 0.7, sz: 1.1 },
    { y: 1.68, z: 0.25, sx: 1.3, sy: 0.8, sz: 1.0 },
    { y: 1.52, z: 0.18, sx: 1.2, sy: 0.7, sz: 1.0 },
    { y: 1.38, z: 0.12, sx: 1.1, sy: 0.7, sz: 1.0 },
    { y: 1.22, z: 0.08, sx: 1.0, sy: 0.6, sz: 1.0 },
  ];
  for (const mp of manePoints) {
    const m = new THREE.Mesh(maneGeo, maneMat);
    m.position.set(0, mp.y, mp.z);
    m.scale.set(mp.sx, mp.sy, mp.sz);
    group.add(m);
  }

  // ── Tail (spheres arcing backward from rump) ──
  const tailGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const tailPoints = [
    { x: 0, y: 0.98, z: -0.7, sx: 1.0, sy: 1.0, sz: 1.0 },
    { x: 0, y: 1.08, z: -0.9, sx: 1.1, sy: 0.8, sz: 1.0 },
    { x: 0, y: 1.12, z: -1.1, sx: 1.2, sy: 0.8, sz: 1.0 },
    { x: 0.05, y: 1.08, z: -1.28, sx: 1.3, sy: 0.9, sz: 1.0 },
    { x: -0.05, y: 0.98, z: -1.42, sx: 1.4, sy: 1.0, sz: 1.0 },
  ];
  for (const tp of tailPoints) {
    const t = new THREE.Mesh(tailGeo, maneMat);
    t.position.set(tp.x, tp.y, tp.z);
    t.scale.set(tp.sx, tp.sy, tp.sz);
    group.add(t);
  }

  return group;
}

/** Create the complete 3D model for a character */
export function createCharacterModel(char: CharacterDef): THREE.Object3D {
  const kartMesh = buildVoxelMesh(kartBody(char.color));
  kartMesh.castShadow = true;

  const rider = buildUnicornRider(char.hornColor, char.maneColor);

  const group = new THREE.Group();
  group.add(kartMesh);
  group.add(rider);
  return group;
}

/** Pastel colours for butterfly collectibles */
const BUTTERFLY_COLORS = [0xff88cc, 0x88ccff, 0xffcc88, 0xcc88ff, 0x88ffcc, 0xffaadd];

/** Create a small butterfly collectible mesh */
export function createButterflyMesh(): THREE.Mesh {
  const color = BUTTERFLY_COLORS[Math.floor(Math.random() * BUTTERFLY_COLORS.length)];
  const voxels: Voxel[] = [
    // Body
    { x: 0, y: 0, z: 0, color: 0x333333 },
    // Left wing
    { x: -1, y: 0, z: 0, color },
    { x: -2, y: 0, z: 0, color },
    { x: -1, y: 1, z: 0, color },
    // Right wing
    { x: 1, y: 0, z: 0, color },
    { x: 2, y: 0, z: 0, color },
    { x: 1, y: 1, z: 0, color },
  ];

  const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.5, VOXEL_SIZE * 0.5, VOXEL_SIZE * 0.5);
  const mergedGeos: THREE.BufferGeometry[] = [];

  for (const v of voxels) {
    const g = geo.clone();
    g.translate(v.x * VOXEL_SIZE * 0.5, v.y * VOXEL_SIZE * 0.5, v.z * VOXEL_SIZE * 0.5);
    const col = new THREE.Color(v.color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = col.r; colors[i + 1] = col.g; colors[i + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    mergedGeos.push(g);
  }

  const merged = mergeBufferGeometries(mergedGeos);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(merged, mat);
  return mesh;
}

/** Create item pickup box mesh — rainbow gift box with "?" */
export function createItemBox(): THREE.Group {
  const group = new THREE.Group();

  // Main box — larger and opaque
  const boxGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5);
  const boxMat = new THREE.MeshLambertMaterial({
    color: 0xff66aa,
    transparent: true,
    opacity: 0.85,
  });
  const box = new THREE.Mesh(boxGeo, boxMat);
  group.add(box);

  // Rainbow accent edges (4 vertical strips)
  const stripColors = [0xff4444, 0x44ff44, 0x4488ff, 0xffdd44];
  for (let i = 0; i < 4; i++) {
    const stripGeo = new THREE.BoxGeometry(0.3, 2.6, 0.3);
    const stripMat = new THREE.MeshLambertMaterial({ color: stripColors[i] });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    const angle = (i / 4) * Math.PI * 2;
    strip.position.set(Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2);
    group.add(strip);
  }

  // "?" label — flat plane with canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const labelGeo = new THREE.PlaneGeometry(1.8, 1.8);
  const labelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  // Front face
  const labelFront = new THREE.Mesh(labelGeo, labelMat);
  labelFront.position.z = 1.26;
  group.add(labelFront);
  // Back face
  const labelBack = new THREE.Mesh(labelGeo, labelMat);
  labelBack.position.z = -1.26;
  labelBack.rotation.y = Math.PI;
  group.add(labelBack);

  group.position.y = 1.8;
  return group;
}

// ── Scenery models ──

const RAINBOW_COLORS = [0xff0000, 0xff8800, 0xffff00, 0x00cc00, 0x0088ff, 0x4400ff, 0x8800cc];

/** Create a rainbow arch made of 7 coloured box segments */
export function createRainbowArch(): THREE.Group {
  const group = new THREE.Group();
  const archHeight = 15;
  const archSpan = 22;
  const bandThickness = 0.8;
  const bandDepth = 1.2;
  const segments = 16;

  for (let band = 0; band < 7; band++) {
    const radius = archSpan / 2 - band * bandThickness * 0.8;
    const mat = new THREE.MeshLambertMaterial({
      color: RAINBOW_COLORS[band],
      transparent: true,
      opacity: 0.8,
    });

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * (archHeight / (archSpan / 2));
      const geo = new THREE.BoxGeometry(bandThickness, bandThickness, bandDepth);
      const seg = new THREE.Mesh(geo, mat);
      seg.position.set(x, y, 0);
      group.add(seg);
    }
  }
  return group;
}

/** Create an improved meadow tree with trunk + round canopy */
export function createMeadowTree(): THREE.Group {
  const group = new THREE.Group();

  // Trunk
  const trunkH = 3 + Math.random() * 2;
  const trunkGeo = new THREE.BoxGeometry(1.2, trunkH, 1.2);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH / 2;
  group.add(trunk);

  // Main canopy (large cube)
  const canopySize = 3.5 + Math.random() * 1.5;
  const canopyGeo = new THREE.BoxGeometry(canopySize, canopySize, canopySize);
  const green = 0x228b22 + Math.floor(Math.random() * 0x002200);
  const canopyMat = new THREE.MeshLambertMaterial({ color: green });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = trunkH + canopySize / 2 - 0.5;
  canopy.rotation.y = Math.random() * Math.PI / 4;
  group.add(canopy);

  // Top cap (smaller cube on top for rounder look)
  const capSize = canopySize * 0.65;
  const capGeo = new THREE.BoxGeometry(capSize, capSize, capSize);
  const cap = new THREE.Mesh(capGeo, canopyMat);
  cap.position.y = trunkH + canopySize + capSize / 2 - 1.2;
  cap.rotation.y = Math.PI / 4;
  group.add(cap);

  return group;
}

/** Create a pine tree — taller trunk + 3 stacked shrinking canopy tiers */
export function createPineTree(): THREE.Group {
  const group = new THREE.Group();

  // Trunk — taller and darker than meadow tree
  const trunkH = 5 + Math.random() * 2;
  const trunkGeo = new THREE.BoxGeometry(1.0, trunkH, 1.0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3317 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH / 2;
  group.add(trunk);

  // 3 canopy tiers — shrinking cubes stacked upward
  const tierSizes = [4.5, 3.2, 2.0];
  const tierHeights = [3.0, 2.5, 2.0];
  let y = trunkH - 1; // overlap with top of trunk
  for (let i = 0; i < 3; i++) {
    const size = tierSizes[i];
    const h = tierHeights[i];
    const green = i === 0 ? 0x1a5c1a : i === 1 ? 0x1e6b1e : 0x227a22;
    const geo = new THREE.BoxGeometry(size, h, size);
    const mat = new THREE.MeshLambertMaterial({ color: green });
    const tier = new THREE.Mesh(geo, mat);
    tier.position.y = y + h / 2;
    tier.rotation.y = Math.random() * Math.PI / 4;
    group.add(tier);
    y += h - 0.4; // slight overlap between tiers
  }

  return group;
}

/** Create a gentle rolling hill (flattened ellipsoid shape using stacked boxes) */
export function createHill(): THREE.Group {
  const group = new THREE.Group();
  const height = 5 + Math.random() * 4;
  const radiusX = 15 + Math.random() * 15;
  const radiusZ = 12 + Math.random() * 12;
  const layers = 5;
  const green = 0x6db84a;

  const mat = new THREE.MeshLambertMaterial({ color: green });

  for (let i = 0; i < layers; i++) {
    const frac = i / layers;
    const y = frac * height;
    const scale = Math.cos(frac * Math.PI / 2); // cosine falloff for dome shape
    const sx = radiusX * 2 * scale;
    const sz = radiusZ * 2 * scale;
    const layerH = height / layers + 0.2; // slight overlap
    const geo = new THREE.BoxGeometry(sx, layerH, sz);
    const layer = new THREE.Mesh(geo, mat);
    layer.position.y = y + layerH / 2;
    group.add(layer);
  }

  return group;
}

/** Create a cluster of 3-5 flowers grouped together */
export function createFlowerPatch(): THREE.Group {
  const group = new THREE.Group();
  const flowerColors = [0xff69b4, 0xff6347, 0xffd700, 0xda70d6, 0x87ceeb, 0x90ee90];
  const count = 3 + Math.floor(Math.random() * 3);

  for (let i = 0; i < count; i++) {
    const ox = (Math.random() - 0.5) * 2.5;
    const oz = (Math.random() - 0.5) * 2.5;
    const stemH = 0.6 + Math.random() * 0.6;

    // Stem
    const stemGeo = new THREE.BoxGeometry(0.15, stemH, 0.15);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(ox, stemH / 2, oz);
    group.add(stem);

    // Flower head
    const headSize = 0.5 + Math.random() * 0.3;
    const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
    const headMat = new THREE.MeshLambertMaterial({
      color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(ox, stemH + headSize / 2, oz);
    head.rotation.y = Math.random() * Math.PI;
    group.add(head);
  }

  return group;
}

// ── Obstacle models ──

/** Create a gate frame spanning the road. 4 pillars + top beam + boost ground stripe */
export function createGateFrame(roadWidth: number, boostSlot: number): THREE.Group {
  const group = new THREE.Group();
  const pillarColor = 0x8844cc; // purple crystal
  const beamColor = 0x9955dd;
  const boostColor = 0x44ff88;

  const pillarMat = new THREE.MeshLambertMaterial({ color: pillarColor });
  const beamMat = new THREE.MeshLambertMaterial({ color: beamColor });
  const halfWidth = roadWidth / 2;

  // 4 pillars along the right vector (x-axis in local space)
  const pillarGeo = new THREE.BoxGeometry(GATE_PILLAR_WIDTH, GATE_PILLAR_HEIGHT, GATE_PILLAR_WIDTH);
  for (let i = 0; i < 4; i++) {
    const x = -halfWidth + (i / 3) * roadWidth;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, GATE_PILLAR_HEIGHT / 2, 0);
    group.add(pillar);
  }

  // Top beam connecting all pillars
  const beamGeo = new THREE.BoxGeometry(roadWidth + GATE_PILLAR_WIDTH, 0.8, GATE_PILLAR_WIDTH * 0.8);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, GATE_PILLAR_HEIGHT + 0.4, 0);
  group.add(beam);

  // Boost slot ground stripe
  const slotWidth = roadWidth / 3;
  const slotX = -halfWidth + boostSlot * slotWidth + slotWidth / 2;
  const stripeGeo = new THREE.PlaneGeometry(slotWidth * 0.8, 3);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripeMat = new THREE.MeshLambertMaterial({
    color: boostColor,
    transparent: true,
    opacity: 0.6,
  });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.name = 'boostStripe';
  stripe.position.set(slotX, 0.03, 0);
  group.add(stripe);

  return group;
}

/** Create a swinging hammer. Returns group with pole + armPivot (child named "armPivot") */
export function createHammer(): THREE.Group {
  const group = new THREE.Group();

  const poleMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const armMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const counterMat = new THREE.MeshLambertMaterial({ color: 0x555555 });

  // Short ground base
  const baseHeight = 1.5;
  const poleGeo = new THREE.CylinderGeometry(0.6, 0.8, baseHeight, 8);
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = baseHeight / 2;
  group.add(pole);

  // Arm pivot at street level (kart height)
  const armPivot = new THREE.Group();
  armPivot.name = 'armPivot';
  armPivot.position.y = baseHeight;
  group.add(armPivot);

  // Horizontal arm
  const armLength = 8;
  const armGeo = new THREE.BoxGeometry(armLength, 0.8, 0.8);
  const arm = new THREE.Mesh(armGeo, armMat);
  arm.position.x = 0; // centered on pivot
  armPivot.add(arm);

  // Hammer head (at one end of arm) — chunky and visible
  const headGeo = new THREE.BoxGeometry(2.5, 3, 2.5);
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(armLength / 2, 0, 0);
  armPivot.add(head);

  // Small counterweight (at other end)
  const counterGeo = new THREE.BoxGeometry(1.2, 1.5, 1.2);
  const counter = new THREE.Mesh(counterGeo, counterMat);
  counter.position.set(-armLength / 2, 0, 0);
  armPivot.add(counter);

  return group;
}
