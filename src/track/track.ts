import * as THREE from 'three';
import { TrackSpline } from './spline';
import { TrackDef, TrackZone, SceneryZone } from '../config/tracks';
import { ROAD_SEGMENTS, ROAD_WIDTH } from '../config/constants';

export class Track {
  readonly spline: TrackSpline;
  readonly zones: TrackZone[];
  readonly roadMesh: THREE.Mesh;
  readonly barrierMeshes: THREE.Mesh[] = [];
  readonly groundMesh: THREE.Mesh;
  private widths: number[];
  private def: TrackDef;

  constructor(def: TrackDef, mirror: boolean = false) {
    this.def = def;
    this.zones = def.zones;

    // Extract positions and widths
    let points = def.controlPoints.map(cp => cp.position.clone());
    this.widths = def.controlPoints.map(cp => cp.width);

    if (mirror) {
      points = points.map(p => new THREE.Vector3(-p.x, p.y, p.z));
    }

    this.spline = new TrackSpline(points);

    // Generate meshes
    this.roadMesh = this.buildRoadMesh();
    this.groundMesh = this.buildGroundMesh();
    this.barrierMeshes = this.buildBarriers();
  }

  get sceneryZones(): SceneryZone[] { return this.def.sceneryZones ?? []; }

  /** Check if a world position is on the road surface */
  isOnRoad(pos: THREE.Vector3): boolean {
    const t = this.spline.closestT(pos);
    const offset = Math.abs(this.spline.lateralOffset(pos));
    const width = this.getWidthAtT(t);
    return offset < width / 2;
  }

  /** Check if position is in a specific zone type */
  isInZone(pos: THREE.Vector3, type: 'drift' | 'item'): boolean {
    const t = this.spline.closestT(pos);
    return this.zones.some(z => z.type === type && t >= z.start && t <= z.end);
  }

  /** Get road width at parameter t (interpolated) */
  private getWidthAtT(t: number): number {
    const n = this.widths.length;
    const idx = t * n;
    const i0 = Math.floor(idx) % n;
    const i1 = (i0 + 1) % n;
    const frac = idx - Math.floor(idx);
    return this.widths[i0] * (1 - frac) + this.widths[i1] * frac;
  }

  /** Get barrier push-back if position is past road edge */
  getBarrierPush(pos: THREE.Vector3): THREE.Vector3 | null {
    const t = this.spline.closestT(pos);
    const offset = this.spline.lateralOffset(pos);
    const halfWidth = this.getWidthAtT(t) / 2;

    if (Math.abs(offset) > halfWidth + 1.5) {
      // Past the barrier — push back toward center
      const right = this.spline.getRight(t);
      const pushDir = offset > 0 ? -1 : 1;
      return right.multiplyScalar(pushDir);
    }
    return null;
  }

  private buildRoadMesh(): THREE.Mesh {
    const segs = ROAD_SEGMENTS;
    const strips = 7; // 7 rainbow bands across the road
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];

    // 7 rainbow hues (red → violet)
    const rainbowHues = [0 / 360, 30 / 360, 60 / 360, 120 / 360, 210 / 360, 260 / 360, 300 / 360];

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const center = this.spline.getPoint(t);
      const right = this.spline.getRight(t);
      const width = this.getWidthAtT(t);
      const isInDriftZone = this.zones.some(
        z => z.type === 'drift' && t >= z.start && t <= z.end
      );

      // Create strips+1 vertices across the width
      for (let s = 0; s <= strips; s++) {
        const frac = s / strips; // 0 = left edge, 1 = right edge
        const offset = (frac - 0.5) * width;
        const pos = center.clone().add(right.clone().multiplyScalar(offset));

        vertices.push(pos.x, pos.y + 0.01, pos.z);
        uvs.push(frac, t * 10);

        // Color: blend between the two nearest rainbow bands
        const bandPos = frac * (strips - 1);
        const bandIdx = Math.min(Math.floor(bandPos), strips - 2);
        const bandFrac = bandPos - bandIdx;
        const hue0 = rainbowHues[bandIdx];
        const hue1 = rainbowHues[bandIdx + 1];
        const hue = hue0 + (hue1 - hue0) * bandFrac;

        const c = new THREE.Color();
        if (isInDriftZone) {
          c.setHSL(hue, 0.8, 0.75);
        } else {
          c.setHSL(hue, 0.6, 0.6);
        }
        colors.push(c.r, c.g, c.b);
      }

      // Build quads between this row and the next
      if (i < segs) {
        const vertsPerRow = strips + 1;
        const rowBase = i * vertsPerRow;
        for (let s = 0; s < strips; s++) {
          const bl = rowBase + s;
          const br = rowBase + s + 1;
          const tl = bl + vertsPerRow;
          const tr = br + vertsPerRow;
          indices.push(bl, br, tl);
          indices.push(br, tr, tl);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geo, mat);
  }

  private buildBarriers(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const segs = ROAD_SEGMENTS;
    const barrierHeight = 1.5;
    const barrierWidth = 0.8;

    for (const side of [-1, 1]) {
      const vertices: number[] = [];
      const indices: number[] = [];
      const colors: number[] = [];

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const center = this.spline.getPoint(t);
        const right = this.spline.getRight(t);
        const width = this.getWidthAtT(t);

        const edgeOffset = (width / 2 + barrierWidth / 2) * side;
        const base = center.clone().add(right.clone().multiplyScalar(edgeOffset));

        // Bottom and top of barrier
        vertices.push(base.x, base.y, base.z);
        vertices.push(base.x, base.y + barrierHeight, base.z);

        // Rainbow colours for barriers!
        const hue = (t + (side > 0 ? 0 : 0.5)) % 1;
        const c = new THREE.Color().setHSL(hue, 0.8, 0.6);
        colors.push(c.r, c.g, c.b);
        colors.push(c.r * 1.3, c.g * 1.3, c.b * 1.3); // brighter top

        if (i < segs) {
          const b = i * 2;
          indices.push(b, b + 1, b + 2);
          indices.push(b + 1, b + 3, b + 2);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });

      meshes.push(new THREE.Mesh(geo, mat));
    }

    return meshes;
  }

  private buildGroundMesh(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(400, 400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x7ec850 }); // grass green
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.05;
    return mesh;
  }
}
