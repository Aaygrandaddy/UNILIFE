import type * as THREE from 'three';
import type { AABB } from './world';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Push a circle of radius r at p out of every box. Returns true on contact. */
export function resolveCircle(p: THREE.Vector3, r: number, boxes: AABB[]): boolean {
  let hit = false;
  for (const b of boxes) {
    if (p.x < b.minX - r || p.x > b.maxX + r || p.z < b.minZ - r || p.z > b.maxZ + r) continue;
    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      const l = p.x - b.minX;
      const rr = b.maxX - p.x;
      const t = p.z - b.minZ;
      const bt = b.maxZ - p.z;
      const m = Math.min(l, rr, t, bt);
      if (m === l) p.x = b.minX - r;
      else if (m === rr) p.x = b.maxX + r;
      else if (m === t) p.z = b.minZ - r;
      else p.z = b.maxZ + r;
    }
  }
  return hit;
}

/** Push a away from b (circles). Returns overlap depth. */
export function separate(a: THREE.Vector3, ra: number, b: THREE.Vector3, rb: number, moveB = false): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const d = Math.hypot(dx, dz);
  const min = ra + rb;
  if (d >= min || d < 1e-6) return 0;
  const push = min - d;
  const nx = dx / d;
  const nz = dz / d;
  if (moveB) {
    a.x += nx * push * 0.5;
    a.z += nz * push * 0.5;
    b.x -= nx * push * 0.5;
    b.z -= nz * push * 0.5;
  } else {
    a.x += nx * push;
    a.z += nz * push;
  }
  return push;
}

/** True if the point is inside any box (used for camera occlusion). */
export function pointInBoxes(x: number, y: number, z: number, boxes: AABB[]) {
  for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.h + 1) return true;
  return false;
}
