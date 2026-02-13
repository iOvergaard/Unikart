import * as THREE from 'three';

/**
 * Closed Catmull-Rom spline through control points.
 * Provides position, tangent, and normal at any parameter t ∈ [0, 1].
 */
export class TrackSpline {
  private curve: THREE.CatmullRomCurve3;
  private _totalLength: number;

  constructor(points: THREE.Vector3[]) {
    this.curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
    this._totalLength = this.curve.getLength();
  }

  get totalLength(): number {
    return this._totalLength;
  }

  /** Get world position at parameter t ∈ [0, 1] */
  getPoint(t: number): THREE.Vector3 {
    return this.curve.getPointAt(this.wrap(t));
  }

  /** Get normalised tangent (forward direction) at t */
  getTangent(t: number): THREE.Vector3 {
    return this.curve.getTangentAt(this.wrap(t)).normalize();
  }

  /** Get right-pointing normal (perpendicular to tangent, on XZ plane) */
  getRight(t: number): THREE.Vector3 {
    const tangent = this.getTangent(t);
    // Cross tangent with world up → right vector
    return new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
  }

  /** Find closest parameter t for a world position (brute-force, good enough for 200 samples) */
  closestT(pos: THREE.Vector3, samples = 200): number {
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = this.getPoint(t);
      const d = pos.distanceToSquared(p);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    return bestT;
  }

  /** Get distance-along-track for a world position */
  distanceAlong(pos: THREE.Vector3): number {
    return this.closestT(pos) * this._totalLength;
  }

  /** Get signed lateral offset from centerline (positive = right) */
  lateralOffset(pos: THREE.Vector3): number {
    const t = this.closestT(pos);
    const center = this.getPoint(t);
    const right = this.getRight(t);
    const toPos = new THREE.Vector3().subVectors(pos, center);
    return toPos.dot(right);
  }

  /** Get an array of evenly-spaced points for rendering */
  getEvenPoints(count: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      points.push(this.getPoint(i / count));
    }
    return points;
  }

  private wrap(t: number): number {
    t = t % 1;
    if (t < 0) t += 1;
    return t;
  }
}
