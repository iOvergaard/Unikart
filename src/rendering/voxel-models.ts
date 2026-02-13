import * as THREE from 'three';
import { VOXEL_SIZE } from '../config/constants';
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

/** Add a unicorn rider with horn and mane */
function unicornRider(hornColor: number, maneColor: number): Voxel[] {
  const voxels: Voxel[] = [];
  const head = 0xffd5b4;

  // Head
  voxels.push({ x: 0, y: 4, z: -1, color: head });
  // Horn (2-high, tapered)
  voxels.push({ x: 0, y: 5, z: -1, color: hornColor });
  voxels.push({ x: 0, y: 6, z: -1, color: hornColor });
  // Mane (flows down both sides + back)
  voxels.push({ x: -1, y: 5, z: -1, color: maneColor });
  voxels.push({ x: 1, y: 5, z: -1, color: maneColor });
  voxels.push({ x: -1, y: 4, z: -1, color: maneColor });
  voxels.push({ x: 1, y: 4, z: -1, color: maneColor });
  voxels.push({ x: 0, y: 4, z: -2, color: maneColor }); // back of mane

  return voxels;
}

/** Create the complete 3D model for a character */
export function createCharacterModel(char: CharacterDef): THREE.Object3D {
  const body = kartBody(char.color);
  const rider = unicornRider(char.hornColor, char.maneColor);

  const mesh = buildVoxelMesh([...body, ...rider]);
  mesh.castShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
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

/** Create item pickup box mesh */
export function createItemBox(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffdd44,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1;
  return mesh;
}
