import * as THREE from 'three';
import { Kart } from '../physics/kart';
import { Track } from '../track/track';
import { createCharacterModel, createItemBox, createButterflyMesh } from './voxel-models';
import { ButterflyInstance } from '../gameplay/butterfly-system';
import { CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_LERP } from '../config/constants';

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private kartMeshes: THREE.Object3D[] = [];
  private itemBoxMeshes: THREE.Mesh[] = [];
  private butterflyMeshes = new Map<number, THREE.Mesh>(); // id → mesh
  knownButterflyCount = 0; // how many butterflies scene has added
  private raceObjects: THREE.Object3D[] = []; // all race-specific scene objects

  // Camera
  private cameraTarget = new THREE.Vector3();
  private cameraPos = new THREE.Vector3();

  // Particles
  private driftParticles: THREE.Points | null = null;
  private boostParticles: THREE.Points | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x87ceeb); // sky blue
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 150, 300);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 500);
    this.camera.position.set(0, 20, -30);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    this.scene.add(sun);

    // Handle resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Create simple particle systems for effects
    this.createParticleSystems();
  }

  /** Add track meshes to scene */
  setupTrack(track: Track): void {
    const add = (obj: THREE.Object3D) => {
      this.scene.add(obj);
      this.raceObjects.push(obj);
    };

    add(track.groundMesh);
    add(track.roadMesh);
    for (const barrier of track.barrierMeshes) {
      add(barrier);
    }

    // Add item boxes at item zone locations
    for (const zone of track.zones) {
      if (zone.type !== 'item') continue;
      const midT = (zone.start + zone.end) / 2;
      const pos = track.spline.getPoint(midT);
      const right = track.spline.getRight(midT);

      // Place 3 boxes across the road
      for (const offset of [-5, 0, 5]) {
        const box = createItemBox();
        box.position.copy(pos).add(right.clone().multiplyScalar(offset));
        add(box);
        this.itemBoxMeshes.push(box);
      }
    }

    // Add some decorative elements
    this.addScenery(track);
  }

  /** Create 3D models for all karts and add to scene */
  setupKarts(karts: Kart[]): void {
    for (const kart of karts) {
      const model = createCharacterModel(kart.character);
      this.scene.add(model);
      this.kartMeshes.push(model);
      kart.mesh = model;
    }
  }

  /** Add initial butterfly meshes to scene */
  setupButterflies(butterflies: ButterflyInstance[]): void {
    this.knownButterflyCount = 0;
    this.addNewButterflies(butterflies);
  }

  /** Add newly spawned butterflies to the scene */
  addNewButterflies(butterflies: ButterflyInstance[]): void {
    for (const b of butterflies) {
      if (this.butterflyMeshes.has(b.id)) continue;
      const mesh = createButterflyMesh();
      mesh.position.copy(b.position);
      this.scene.add(mesh);
      this.raceObjects.push(mesh);
      this.butterflyMeshes.set(b.id, mesh);
    }
    this.knownButterflyCount = this.butterflyMeshes.size;
  }

  /** Remove collected butterflies from scene */
  removeButterflies(ids: number[]): void {
    for (const id of ids) {
      const mesh = this.butterflyMeshes.get(id);
      if (mesh) {
        this.scene.remove(mesh);
        this.butterflyMeshes.delete(id);
      }
    }
  }

  /** Animate butterfly bob + wing flap */
  updateButterflies(time: number): void {
    for (const [id, mesh] of this.butterflyMeshes) {
      // Gentle bob
      const baseY = 1.5;
      mesh.position.y = baseY + Math.sin(time * 2 + id * 0.7) * 0.4;
      // Wing flap (rotation around Y)
      mesh.rotation.y = Math.sin(time * 6 + id * 1.3) * 0.5;
    }
  }

  /** Update kart meshes from physics state + camera follow */
  updateFrame(karts: Kart[], humanKart: Kart, dt: number): void {
    // Update kart meshes
    for (let i = 0; i < karts.length; i++) {
      const kart = karts[i];
      const mesh = this.kartMeshes[i];
      if (!mesh) continue;

      mesh.position.copy(kart.position);
      mesh.rotation.y = kart.rotation;

      // Visual effects
      if (kart.gustTimer > 0) {
        mesh.rotation.y += kart.spinAngle;
      }
      if (kart.wobbleTimer > 0) {
        mesh.position.y = Math.sin(Date.now() * 0.02) * 0.3;
        mesh.rotation.z = Math.sin(Date.now() * 0.015) * 0.1;
      } else {
        mesh.rotation.z = 0;
      }

      // Drift visual: slight lean
      if (kart.drift.isCharging) {
        mesh.rotation.z = kart.drift.driftDirection * 0.15;
      }
    }

    // Rotate item boxes
    const rotSpeed = Date.now() * 0.001;
    for (const box of this.itemBoxMeshes) {
      box.rotation.y = rotSpeed;
      box.position.y = 1 + Math.sin(rotSpeed * 2 + box.position.x) * 0.3;
    }

    // ── Chase camera ──
    const fwd = humanKart.forward;
    const desiredPos = humanKart.position.clone()
      .add(fwd.clone().multiplyScalar(-CAMERA_DISTANCE))
      .add(new THREE.Vector3(0, CAMERA_HEIGHT, 0));

    const desiredTarget = humanKart.position.clone()
      .add(fwd.clone().multiplyScalar(8));

    const lerpFactor = 1 - Math.exp(-CAMERA_LERP * dt);
    this.cameraPos.lerp(desiredPos, lerpFactor);
    this.cameraTarget.lerp(desiredTarget, lerpFactor);

    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(this.cameraTarget);

    // ── Drift particles ──
    this.updateDriftParticles(humanKart);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Clear all race-specific objects from scene */
  cleanup(): void {
    for (const obj of this.raceObjects) this.scene.remove(obj);
    for (const mesh of this.kartMeshes) this.scene.remove(mesh);
    this.raceObjects = [];
    this.kartMeshes = [];
    this.itemBoxMeshes = [];
    this.butterflyMeshes.clear();
    this.knownButterflyCount = 0;
  }

  private createParticleSystems(): void {
    // Drift particles
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });

    this.driftParticles = new THREE.Points(geo, mat);
    this.driftParticles.visible = false;
    this.scene.add(this.driftParticles);
  }

  private updateDriftParticles(kart: Kart): void {
    if (!this.driftParticles) return;

    if (kart.drift.isCharging || kart.drift.isBoosting) {
      this.driftParticles.visible = true;
      const pos = this.driftParticles.geometry.attributes.position as THREE.BufferAttribute;
      const col = this.driftParticles.geometry.attributes.color as THREE.BufferAttribute;

      // Tier colours
      const tierColors = [
        new THREE.Color(0x4488ff), // tier 0/1: blue
        new THREE.Color(0x44ff88), // tier 2: green
        new THREE.Color(0xffdd44), // tier 3: gold
      ];
      const tc = tierColors[Math.min(kart.drift.tier, 2)];

      if (kart.drift.isBoosting) {
        tc.set(0xff8844); // orange during boost
      }

      for (let i = 0; i < 50; i++) {
        const life = (Date.now() * 0.003 + i * 0.1) % 1;
        const spread = (Math.random() - 0.5) * 2;

        pos.setXYZ(i,
          kart.position.x - kart.forward.x * life * 3 + spread,
          kart.position.y + life * 1.5,
          kart.position.z - kart.forward.z * life * 3 + spread
        );
        col.setXYZ(i, tc.r, tc.g, tc.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    } else {
      this.driftParticles.visible = false;
    }
  }

  private addScenery(track: Track): void {
    // Scatter some "flowers" (small coloured boxes) around the track
    const flowerColors = [0xff69b4, 0xff6347, 0xffd700, 0xda70d6, 0x87ceeb, 0x90ee90];

    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 150;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Skip if too close to road
      const testPos = new THREE.Vector3(x, 0, z);
      if (track.isOnRoad(testPos)) continue;

      // Flower stem
      const stemGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
      const stemMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(x, 0.5, z);
      this.scene.add(stem);
      this.raceObjects.push(stem);

      // Flower head
      const flowerGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const flowerMat = new THREE.MeshLambertMaterial({
        color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
      });
      const flower = new THREE.Mesh(flowerGeo, flowerMat);
      flower.position.set(x, 1.2, z);
      flower.rotation.y = Math.random() * Math.PI;
      this.scene.add(flower);
      this.raceObjects.push(flower);
    }

    // A few "trees" (stacked boxes)
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 120;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const testPos = new THREE.Vector3(x, 0, z);
      if (track.isOnRoad(testPos)) continue;

      // Trunk
      const trunkGeo = new THREE.BoxGeometry(1, 4, 1);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 2, z);
      this.scene.add(trunk);
      this.raceObjects.push(trunk);

      // Canopy
      const canopyGeo = new THREE.BoxGeometry(3, 3, 3);
      const canopyMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(x, 5, z);
      this.scene.add(canopy);
      this.raceObjects.push(canopy);
    }
  }
}
