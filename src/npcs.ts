import * as THREE from 'three';
import { BUILDINGS, GATE, PARADE } from './config';
import { Human, airmanLook, randomLook } from './human';
import { entrance, mulberry32 } from './world';
import type { Vehicle } from './vehicles';

interface Walker {
  human: Human;
  pts: THREE.Vector2[];
  idx: number;
  dir: 1 | -1;
  loop: boolean;
  speed: number;
}

interface Idler {
  human: Human;
}

const rect = (x1: number, z1: number, x2: number, z2: number) => [
  new THREE.Vector2(x1, z1),
  new THREE.Vector2(x2, z1),
  new THREE.Vector2(x2, z2),
  new THREE.Vector2(x1, z2),
];

// Sidewalk loops and lines the students walk along.
const PATHS: { pts: THREE.Vector2[]; loop: boolean }[] = [
  { pts: rect(-132.3, -132.3, 132.3, 102.3), loop: true },
  { pts: rect(-147.7, -147.7, 147.7, 117.7), loop: true },
  { pts: [new THREE.Vector2(-8.7, 22), new THREE.Vector2(-8.7, 240)], loop: false },
  { pts: [new THREE.Vector2(8.7, 22), new THREE.Vector2(8.7, 240)], loop: false },
  { pts: [new THREE.Vector2(-132, -7.7), new THREE.Vector2(-22, -7.7)], loop: false },
  { pts: [new THREE.Vector2(22, 7.7), new THREE.Vector2(132, 7.7)], loop: false },
  { pts: [new THREE.Vector2(-132, 7.7), new THREE.Vector2(-22, 7.7)], loop: false },
  { pts: [new THREE.Vector2(22, -7.7), new THREE.Vector2(132, -7.7)], loop: false },
];

interface Marcher {
  human: Human;
  rank: number;
  file: number;
}

export class Crowd {
  walkers: Walker[] = [];
  idlers: Idler[] = [];
  guards: Human[] = [];
  squad: Marcher[] = [];
  private squadT = 0;
  /** True during the Retreat ceremony: everyone outdoors stops and stands to attention. */
  halted = false;
  private rand = mulberry32(777);
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, count = 56) {
    for (let i = 0; i < count; i++) {
      const path = PATHS[i % PATHS.length];
      const human = new Human(randomLook(this.rand, this.rand() < 0.5), i % 3 === 0);
      const seg = Math.floor(this.rand() * (path.pts.length - (path.loop ? 0 : 1)));
      const a = path.pts[seg];
      const b = path.pts[(seg + 1) % path.pts.length];
      const t = this.rand();
      human.group.position.set(a.x + (b.x - a.x) * t, 0.04, a.y + (b.y - a.y) * t);
      scene.add(human.group);
      this.walkers.push({
        human,
        pts: path.pts,
        idx: (seg + 1) % path.pts.length,
        dir: 1,
        loop: path.loop,
        speed: 1.1 + this.rand() * 0.6,
      });
    }
    // small groups chatting outside buildings
    for (const b of BUILDINGS) {
      if (this.rand() < 0.25) continue;
      const e = entrance(b, 10);
      const n = 2 + Math.floor(this.rand() * 3);
      const cx = e.x + (this.rand() - 0.5) * 6;
      const cz = e.z + (this.rand() - 0.5) * 4;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const human = new Human(randomLook(this.rand, b.name.includes('Female') ? true : this.rand() < 0.5), false);
        human.group.position.set(cx + Math.sin(a) * 0.9, 0, cz + Math.cos(a) * 0.9);
        human.group.lookAt(cx, 0, cz);
        human.group.rotateY(Math.PI);
        scene.add(human.group);
        this.idlers.push({ human });
      }
    }
  }

  /** A squad of airmen drilling on the parade ground, plus guards at the main gate. */
  addBase(scene: THREE.Scene) {
    for (let rank = 0; rank < 4; rank++) {
      for (let file = 0; file < 3; file++) {
        const h = new Human(airmanLook(this.rand), rank === 0);
        h.style = 'march';
        scene.add(h.group);
        this.squad.push({ human: h, rank, file });
      }
    }
    for (const [x, z, yaw] of [[12.6, GATE.z + 4, Math.PI], [-11, GATE.z + 6, Math.PI], [12.6, GATE.z - 3.5, -Math.PI / 2]] as const) {
      const h = new Human(airmanLook(this.rand), true);
      h.group.position.set(x, 0, z);
      h.group.rotation.y = yaw;
      scene.add(h.group);
      this.guards.push(h);
    }
  }

  private updateSquad(dt: number) {
    // loop around the inside of the parade ground
    const x0 = PARADE.x - PARADE.w / 2 + 8;
    const x1 = PARADE.x + PARADE.w / 2 - 8;
    const z0 = PARADE.z - PARADE.d / 2 + 8;
    const z1 = PARADE.z + PARADE.d / 2 - 8;
    const lw = x1 - x0;
    const lh = z1 - z0;
    const perim = 2 * (lw + lh);
    if (!this.halted) this.squadT = (this.squadT + dt * 1.3) % perim;
    const at = (t: number) => {
      t = ((t % perim) + perim) % perim;
      if (t < lw) return { x: x0 + t, z: z0, yaw: -Math.PI / 2 };
      t -= lw;
      if (t < lh) return { x: x1, z: z0 + t, yaw: Math.PI };
      t -= lh;
      if (t < lw) return { x: x1 - t, z: z1, yaw: Math.PI / 2 };
      t -= lw;
      return { x: x0, z: z1 - t, yaw: 0 };
    };
    for (const m of this.squad) {
      const p = at(this.squadT - m.rank * 1.4);
      const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
      const off = (m.file - 1) * 1.1;
      m.human.group.position.set(p.x + right.x * off, 0, p.z + right.z * off);
      m.human.group.rotation.y = p.yaw;
      if (this.halted) m.human.attention();
      else m.human.animate(1.3, dt);
    }
  }

  update(dt: number, camPos: THREE.Vector3, playerCar: Vehicle | null) {
    this.updateSquad(dt);
    for (const g of this.guards) g.animate(0, dt);
    for (const w of this.walkers) {
      const p = w.human.group.position;
      const far = p.distanceToSquared(camPos) > 220 * 220;
      w.human.group.visible = !far;
      const target = w.pts[w.idx];
      const dx = target.x - p.x;
      const dz = target.y - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) {
        if (w.loop) w.idx = (w.idx + w.dir + w.pts.length) % w.pts.length;
        else {
          w.dir = w.dir === 1 ? -1 : 1;
          w.idx = w.dir === 1 ? 1 : 0;
          if (w.pts.length > 2) w.idx = Math.max(0, Math.min(w.pts.length - 1, w.idx));
        }
        continue;
      }
      if (this.halted) {
        w.human.attention();
        continue;
      }
      let speed = w.speed;
      // jump out of the way of the player's car
      if (playerCar && Math.abs(playerCar.speed) > 2) {
        this.tmp.subVectors(p, playerCar.pos);
        const dist = this.tmp.length();
        if (dist < 6) {
          this.tmp.normalize();
          p.addScaledVector(this.tmp, 5 * dt);
          speed = 4;
        }
      }
      p.x += (dx / d) * w.speed * dt;
      p.z += (dz / d) * w.speed * dt;
      w.human.group.rotation.y = Math.atan2(-dx, -dz);
      if (!far) w.human.animate(speed, dt);
    }
    for (const i of this.idlers) {
      if (i.human.group.position.distanceToSquared(camPos) < 120 * 120) i.human.animate(0, dt);
    }
  }
}
