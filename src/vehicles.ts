import * as THREE from 'three';
import type { VKind } from './config';
import { angleDiff, clamp, resolveCircle, separate } from './physics';
import type { AABB } from './world';
import * as T from './textures';

interface Spec {
  maxSpeed: number;
  accel: number;
  brake: number;
  reverse: number;
  turn: number;
  radius: number;
  camDist: number;
  camHeight: number;
}

const SPECS: Record<VKind, Spec> = {
  car: { maxSpeed: 32, accel: 7.5, brake: 16, reverse: 7, turn: 1.9, radius: 1.9, camDist: 8.5, camHeight: 2 },
  suv: { maxSpeed: 30, accel: 6.5, brake: 15, reverse: 7, turn: 1.7, radius: 2.1, camDist: 9.5, camHeight: 2.4 },
  keke: { maxSpeed: 17, accel: 4.5, brake: 10, reverse: 4, turn: 2.3, radius: 1.4, camDist: 7, camHeight: 2.2 },
  pickup: { maxSpeed: 29, accel: 6.8, brake: 15, reverse: 7, turn: 1.6, radius: 2.2, camDist: 10, camHeight: 2.5 },
  bus: { maxSpeed: 22, accel: 3.2, brake: 9, reverse: 4, turn: 1.1, radius: 3.4, camDist: 15, camHeight: 3.6 },
};

const shared = {
  glass: new THREE.MeshStandardMaterial({ color: '#16212b', roughness: 0.08, metalness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.3, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d0d0d0', roughness: 0.2, metalness: 1 }),
  tail: new THREE.MeshStandardMaterial({ color: '#7a0a0a', emissive: '#ff1a1a', emissiveIntensity: 0.3 }),
};

export class Vehicle {
  group = new THREE.Group();
  body = new THREE.Group();
  yaw = 0;
  speed = 0;
  steer = 0;
  spec: Spec;
  wheels: THREE.Object3D[] = [];
  frontWheels: THREE.Object3D[] = [];
  head: THREE.MeshStandardMaterial;
  beam?: THREE.SpotLight;
  driven = false;
  /** True while an AI car is held up by the player. */
  heldUp = false;
  ai?: { pts: THREE.Vector2[]; idx: number; loop: boolean; cruise: number; stopAtEnd?: boolean; arrived?: boolean };
  private wheelR = 0.34;

  constructor(public kind: VKind, color: string, public label: string) {
    this.spec = SPECS[kind];
    this.head = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff2c4', emissiveIntensity: 0.1 });
    this.group.add(this.body);
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
    if (kind === 'car' || kind === 'suv' || kind === 'pickup') this.buildCar(paint, kind);
    else if (kind === 'keke') this.buildKeke(paint);
    else this.buildBus(paint);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  get pos() {
    return this.group.position;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    this.body.add(mesh);
    return mesh;
  }

  private wheel(x: number, z: number, r: number, w: number, front: boolean) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), shared.tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 10).rotateZ(Math.PI / 2), shared.rim);
    spin.add(tyre, rim);
    pivot.add(spin);
    this.group.add(pivot);
    this.wheels.push(spin);
    if (front) this.frontWheels.push(pivot);
    this.wheelR = r;
  }

  private lights(width: number, y: number, frontZ: number, backZ: number) {
    for (const s of [-1, 1]) {
      this.part(new THREE.BoxGeometry(0.42, 0.16, 0.06), this.head, s * (width / 2 - 0.3), y, frontZ);
      this.part(new THREE.BoxGeometry(0.4, 0.14, 0.06), shared.tail, s * (width / 2 - 0.3), y, backZ);
    }
  }

  /** Extrude a side profile (s = along the car, front at -s; y = up) across the car's width. */
  private profile(pts: [number, number][], width: number, m: THREE.Material, bevel = 0.05) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
    g.rotateY(-Math.PI / 2);
    g.translate(width / 2 - bevel, 0, 0);
    const mesh = new THREE.Mesh(g, m);
    this.body.add(mesh);
    return mesh;
  }

  /** A pillar between two profile points, on both sides. */
  private pillar(a: [number, number], b: [number, number], x: number, m: THREE.Material) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, len + 0.04), m);
      p.position.set(sx * x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
      p.rotation.x = Math.atan2(b[1] - a[1], b[0] - a[0]);
      this.body.add(p);
    }
  }

  private buildCar(paint: THREE.Material, kind: 'car' | 'suv' | 'pickup') {
    const W = kind === 'car' ? 1.78 : 1.92;
    let lower: [number, number][];
    let cabin: [number, number][];
    let L: number;
    if (kind === 'car') {
      L = 4.5;
      lower = [[-2.25, 0.32], [-2.3, 0.6], [-2.15, 0.84], [-0.9, 0.94], [1.5, 0.98], [2.22, 0.94], [2.28, 0.62], [2.18, 0.32]];
      cabin = [[-0.92, 0.93], [-0.32, 1.38], [0.8, 1.4], [1.52, 0.97]];
    } else if (kind === 'suv') {
      L = 4.75;
      lower = [[-2.37, 0.42], [-2.42, 0.78], [-2.28, 1.02], [-1.25, 1.1], [2.3, 1.12], [2.38, 0.8], [2.3, 0.42]];
      cabin = [[-1.27, 1.09], [-0.65, 1.74], [2.05, 1.76], [2.32, 1.11]];
    } else {
      L = 5.2;
      lower = [[-2.6, 0.42], [-2.65, 0.78], [-2.5, 1.02], [-1.4, 1.08], [2.55, 1.1], [2.62, 0.78], [2.55, 0.42]];
      cabin = [[-1.42, 1.07], [-0.85, 1.7], [0.25, 1.72], [0.3, 1.09]];
    }
    // lower body, glass house, roof panel
    this.profile(lower, W, paint, 0.06);
    this.profile(cabin, W - 0.16, shared.glass, 0.02);
    const roofA = cabin[1];
    const roofB = cabin[2];
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.06, roofB[0] - roofA[0] + 0.06), paint);
    roof.position.set(0, (roofA[1] + roofB[1]) / 2 + 0.03, (roofA[0] + roofB[0]) / 2);
    roof.rotation.x = Math.atan2(roofB[1] - roofA[1], roofB[0] - roofA[0]);
    this.body.add(roof);
    const px = W / 2 - 0.1;
    this.pillar(cabin[0], cabin[1], px, paint);
    this.pillar(cabin[2], cabin[3], px, paint);
    const bz = (roofA[0] + roofB[0]) / 2 + 0.1;
    this.pillar([bz, cabin[0][1]], [bz, roofA[1]], px, paint);
    if (kind === 'pickup') {
      // open load bed with side walls and tailgate
      const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.05, 2.1), shared.dark);
      bedFloor.position.set(0, 1.12, 1.4);
      this.body.add(bedFloor);
      for (const sx of [-1, 1]) this.part(new THREE.BoxGeometry(0.08, 0.45, 2.2), paint, sx * (W / 2 - 0.04), 1.32, 1.4);
      this.part(new THREE.BoxGeometry(W, 0.45, 0.08), paint, 0, 1.32, 2.52);
      this.part(new THREE.BoxGeometry(W - 0.2, 0.06, 0.06), shared.chrome, 0, 1.58, 0.35);
    }
    const base = lower[0][1];
    this.part(new THREE.BoxGeometry(W + 0.06, 0.22, 0.24), shared.dark, 0, base + 0.08, -L / 2);
    this.part(new THREE.BoxGeometry(W + 0.06, 0.22, 0.24), shared.dark, 0, base + 0.08, L / 2);
    this.part(new THREE.BoxGeometry(0.8, 0.16, 0.04), shared.chrome, 0, base + 0.33, -L / 2 - 0.04);
    for (const sx of [-1, 1]) this.part(new THREE.BoxGeometry(0.06, 0.12, 0.2), paint, sx * (W / 2 + 0.06), cabin[0][1] + 0.08, cabin[0][0] + 0.25);
    this.lights(W, base + 0.36, -L / 2 - 0.03, L / 2 + 0.03);
    const r = kind === 'car' ? 0.33 : 0.4;
    for (const [x, z, f] of [[-W / 2 + 0.04, -L / 2 + 0.85, true], [W / 2 - 0.04, -L / 2 + 0.85, true], [-W / 2 + 0.04, L / 2 - 0.85, false], [W / 2 - 0.04, L / 2 - 0.85, false]] as const) {
      this.wheel(x, z, r, 0.25, f);
    }
    this.part(new THREE.BoxGeometry(0.52, 0.12, 0.02), new THREE.MeshStandardMaterial({ map: T.sign('KAD 214 AB', { bg: '#f4f4f4', fg: '#0b6b3a', w: 256, h: 64 }) }), 0, base + 0.3, L / 2 + 0.13);
  }

  private buildKeke(paint: THREE.Material) {
    const green = new THREE.MeshStandardMaterial({ color: '#1f7a3a', roughness: 0.5, metalness: 0.3 });
    this.part(new THREE.BoxGeometry(1.32, 0.55, 2.1), paint, 0, 0.62, 0.25);
    this.part(new THREE.BoxGeometry(0.9, 0.7, 0.7), paint, 0, 0.75, -1.05);
    this.part(new THREE.BoxGeometry(1.34, 0.1, 2.1), green, 0, 0.92, 0.25);
    this.part(new THREE.BoxGeometry(1.42, 0.08, 2.5), shared.dark, 0, 2.02, 0.05);
    for (const [x, z] of [[-0.62, -0.95], [0.62, -0.95], [-0.62, 1.2], [0.62, 1.2]]) this.part(new THREE.BoxGeometry(0.06, 1.1, 0.06), shared.dark, x, 1.47, z);
    this.part(new THREE.BoxGeometry(1.2, 0.75, 0.04), shared.glass, 0, 1.45, -1.0);
    this.part(new THREE.BoxGeometry(1.0, 0.5, 0.6), shared.dark, 0, 1.15, 0.85);
    this.lights(1.0, 0.95, -1.42, 1.32);
    this.wheel(0, -1.05, 0.28, 0.18, true);
    this.wheel(-0.62, 0.95, 0.3, 0.2, false);
    this.wheel(0.62, 0.95, 0.3, 0.2, false);
  }

  private buildBus(paint: THREE.Material) {
    const blue = new THREE.MeshStandardMaterial({ color: '#1d3f73', roughness: 0.4, metalness: 0.4 });
    this.part(new THREE.BoxGeometry(2.5, 2.4, 10.5), paint, 0, 1.75, 0);
    this.part(new THREE.BoxGeometry(2.54, 0.9, 9.6), shared.glass, 0, 2.3, 0.3);
    this.part(new THREE.BoxGeometry(2.3, 1.1, 0.06), shared.glass, 0, 2.2, -5.27);
    this.part(new THREE.BoxGeometry(2.56, 0.25, 10.52), blue, 0, 1.35, 0);
    this.part(new THREE.BoxGeometry(2.52, 0.12, 10.5), blue, 0, 2.96, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), new THREE.MeshStandardMaterial({ map: T.sign('FORCE LIFE SHUTTLE', { bg: '#111', fg: '#ffb300', w: 512, h: 80 }), emissive: '#ffb300', emissiveIntensity: 0.2 }));
    sign.position.set(0, 2.84, -5.29);
    sign.rotation.y = Math.PI;
    this.body.add(sign);
    this.lights(2.5, 1.0, -5.27, 5.27);
    for (const [x, z, f] of [[-1.15, -3.4, true], [1.15, -3.4, true], [-1.15, 3.3, false], [1.15, 3.3, false]] as const) this.wheel(x, z, 0.5, 0.32, f);
  }

  setNight(n: number) {
    this.head.emissiveIntensity = 0.1 + n * 2.4;
    shared.tail.emissiveIntensity = 0.3 + n * 1.2;
  }

  syncTransform(dt = 1 / 60) {
    this.group.rotation.y = this.yaw;
    const spin = this.speed / this.wheelR;
    for (const w of this.wheels) w.rotation.x -= spin * dt;
    for (const f of this.frontWheels) f.rotation.y = this.steer * 0.5;
    this.body.rotation.z = clamp(-this.steer * this.speed * 0.004, -0.06, 0.06);
  }

  /** Player driving. */
  drive(input: { throttle: number; steer: number; handbrake: boolean }, dt: number, colliders: AABB[], others: Vehicle[]) {
    const s = this.spec;
    this.steer += (input.steer - this.steer) * Math.min(1, dt * 6);
    if (input.throttle > 0) {
      this.speed += (this.speed < 0 ? s.brake : s.accel * (1 - Math.max(0, this.speed) / s.maxSpeed) * 1.4) * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= s.brake * dt;
      else this.speed = Math.max(-s.reverse, this.speed - s.accel * 0.6 * dt);
    } else {
      const roll = 2.2 * dt;
      this.speed = Math.abs(this.speed) < roll ? 0 : this.speed - Math.sign(this.speed) * roll;
    }
    if (input.handbrake) {
      const hb = 12 * dt;
      this.speed = Math.abs(this.speed) < hb ? 0 : this.speed - Math.sign(this.speed) * hb;
    }
    this.speed = clamp(this.speed, -s.reverse, s.maxSpeed);
    const grip = clamp(Math.abs(this.speed) / 6, 0, 1) * (input.handbrake ? 1.5 : 1);
    this.yaw += this.steer * s.turn * grip * Math.sign(this.speed) * dt * (1 - Math.min(0.45, Math.abs(this.speed) / 80));
    const f = this.forward();
    this.pos.addScaledVector(f, this.speed * dt);
    if (resolveCircle(this.pos, s.radius, colliders)) this.speed *= 0.6;
    for (const o of others) {
      if (o === this) continue;
      if (separate(this.pos, s.radius, o.pos, o.spec.radius) > 0) {
        this.speed *= 0.7;
        if (o.ai) o.speed *= 0.5;
      }
    }
    this.syncTransform(dt);
  }

  /** AI traffic. `obstacles` are positions the car should brake for. */
  think(dt: number, cars: Vehicle[], obstacles: THREE.Vector3[]) {
    const ai = this.ai!;
    if (ai.arrived) {
      this.speed = Math.max(0, this.speed - this.spec.brake * dt);
      this.pos.addScaledVector(this.forward(), this.speed * dt);
      this.syncTransform(dt);
      return;
    }
    const target = ai.pts[ai.idx];
    const dx = target.x - this.pos.x;
    const dz = target.y - this.pos.z;
    if (Math.hypot(dx, dz) < (ai.stopAtEnd && ai.idx === ai.pts.length - 1 ? 3 : 5)) {
      ai.idx++;
      if (ai.idx >= ai.pts.length && ai.stopAtEnd) {
        ai.arrived = true;
        return;
      }
      if (ai.idx >= ai.pts.length) {
        if (ai.loop) ai.idx = 0;
        else {
          ai.idx = 1;
          this.pos.set(ai.pts[0].x, 0, ai.pts[0].y);
          this.yaw = Math.atan2(-(ai.pts[1].x - ai.pts[0].x), -(ai.pts[1].y - ai.pts[0].y));
        }
      }
      return;
    }
    const desired = Math.atan2(-dx, -dz);
    const diff = angleDiff(this.yaw, desired);
    this.steer = clamp(diff * 2, -1, 1);
    this.yaw += clamp(diff, -this.spec.turn * 0.9 * dt, this.spec.turn * 0.9 * dt);
    let want = Math.abs(diff) > 0.35 ? Math.min(ai.cruise, 7) : ai.cruise;
    if (ai.stopAtEnd && ai.idx === ai.pts.length - 1) want = Math.min(want, Math.max(2, Math.hypot(dx, dz) * 0.6));

    const f = this.forward();
    this.heldUp = false;
    const check = (p: THREE.Vector3, r: number, player = false) => {
      const rx = p.x - this.pos.x;
      const rz = p.z - this.pos.z;
      const along = rx * f.x + rz * f.z;
      const lateral = Math.abs(rx * f.z - rz * f.x);
      if (along > 0 && along < 16 && lateral < 1.8 + r) {
        want = Math.min(want, Math.max(0, (along - 6) * 0.9));
        if (player && along < 12) this.heldUp = true;
      }
    };
    for (const o of obstacles) check(o, 0.6, true);
    for (const c of cars) {
      if (c === this) continue;
      const cf = c.forward();
      if (cf.x * f.x + cf.z * f.z > 0.4 || c.driven) check(c.pos, c.spec.radius * 0.5, c.driven);
    }
    const rate = want < this.speed ? this.spec.brake : this.spec.accel;
    this.speed += clamp(want - this.speed, -rate * dt, rate * dt);
    this.pos.addScaledVector(f, this.speed * dt);
    this.syncTransform(dt);
  }
}

/** Shift each waypoint to the right-hand lane. */
export function laneRoute(pts: [number, number][], lane: number, loop: boolean): THREE.Vector2[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dirs: THREE.Vector2[] = [];
    if (loop || i > 0) dirs.push(new THREE.Vector2(p[0] - prev[0], p[1] - prev[1]).normalize());
    if (loop || i < n - 1) dirs.push(new THREE.Vector2(next[0] - p[0], next[1] - p[1]).normalize());
    const right = new THREE.Vector2();
    for (const d of dirs) right.add(new THREE.Vector2(-d.y, d.x));
    right.normalize();
    // forward (dx, dz) -> right-hand side is (-dz, dx)
    return new THREE.Vector2(p[0] + right.x * lane, p[1] + right.y * lane);
  });
}
