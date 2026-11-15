import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BUILDINGS,
  HANGAR,
  FENCE,
  GATE,
  PARADE,
  PARKING,
  ROADS,
  ROUNDABOUT,
  SHOP_SIGNS,
  STADIUM,
  UNI,
  type BuildingDef,
  type Facing,
  type RoadDef,
} from './config';
import * as T from './textures';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
}

export interface NightMat {
  mat: THREE.MeshStandardMaterial;
  max: number;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roadRect(r: RoadDef) {
  const horiz = r.z1 === r.z2;
  return horiz
    ? { minX: Math.min(r.x1, r.x2), maxX: Math.max(r.x1, r.x2), minZ: r.z1 - r.w / 2, maxZ: r.z1 + r.w / 2, horiz }
    : { minX: r.x1 - r.w / 2, maxX: r.x1 + r.w / 2, minZ: Math.min(r.z1, r.z2), maxZ: Math.max(r.z1, r.z2), horiz };
}
export const ROAD_RECTS = ROADS.map(roadRect);

/** Index of the road at (x, z), or -1. The roundabout counts as road index -2. */
export function roadAt(x: number, z: number, pad = 0, exclude = -1): number {
  if (Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) < ROUNDABOUT.r + pad) return -2;
  for (let i = 0; i < ROAD_RECTS.length; i++) {
    if (i === exclude) continue;
    const r = ROAD_RECTS[i];
    if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return i;
  }
  return -1;
}

export function buildingBox(b: BuildingDef): AABB {
  return { minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, h: b.h };
}

function faceFrame(b: BuildingDef, f: Facing = b.facing) {
  switch (f) {
    case 's':
      return { x: b.x, z: b.z + b.d / 2, rot: 0, width: b.w };
    case 'n':
      return { x: b.x, z: b.z - b.d / 2, rot: Math.PI, width: b.w };
    case 'e':
      return { x: b.x + b.w / 2, z: b.z, rot: Math.PI / 2, width: b.d };
    case 'w':
      return { x: b.x - b.w / 2, z: b.z, rot: -Math.PI / 2, width: b.d };
  }
}

export function entrance(b: BuildingDef, out = 4): THREE.Vector3 {
  const f = faceFrame(b);
  return new THREE.Vector3(f.x + Math.sin(f.rot) * out, 0, f.z + Math.cos(f.rot) * out);
}

/** Box whose UVs are in world units, so one tiling texture fits any size. */
function worldBox(w: number, h: number, d: number, tileW = 16, tileH = 14.4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tileW, (uv.getY(i) * dims[f][1]) / tileH);
    }
  }
  return g;
}

/** Triangular prism roof, ridge along Z. */
function prismGeo(width: number, length: number, height: number) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, height);
  s.lineTo(-width / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  return g;
}

export class WorldBuilder {
  colliders: AABB[] = [];
  night: NightMat[] = [];
  pois: Record<string, THREE.Vector3> = {};
  stars!: THREE.Points;
  private rand = mulberry32(20261115);
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private lampMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffb347', emissiveIntensity: 0 });

  constructor(private scene: THREE.Scene) {
    this.night.push({ mat: this.lampMat, max: 3 });
  }

  mat(color: string, rough = 0.85, metal = 0): THREE.MeshStandardMaterial {
    const key = `${color}|${rough}|${metal}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.mats.set(key, m);
    }
    return m;
  }

  box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, cast = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  signMesh(text: string, w: number, h: number, opts: Parameters<typeof T.sign>[1] = {}) {
    const tex = T.sign(text, { ...opts, w: 1024, h: Math.max(64, Math.round((1024 * h) / w)) });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0 });
    this.night.push({ mat: m, max: 0.35 });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  }

  // ---------- ground ----------
  ground() {
    const lat = T.laterite();
    lat.repeat.set(80, 80);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: lat, roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.25;
    outside.receiveShadow = true;
    this.scene.add(outside);

    const g = T.grass();
    g.repeat.set((FENCE * 2) / 12, (FENCE * 2) / 12);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(FENCE * 2, FENCE * 2), new THREE.MeshStandardMaterial({ map: g, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    this.scene.add(lawn);
  }

  // ---------- roads, sidewalks, kerbs ----------
  roads() {
    const tex = T.road();
    const roadMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    const plainAsphalt = T.plain('#3b3c3e', 0.2);
    plainAsphalt.repeat.set(6, 6);
    const asphaltMat = new THREE.MeshStandardMaterial({ map: plainAsphalt, roughness: 0.92 });

    ROADS.forEach((r) => {
      const rect = roadRect(r);
      const len = rect.horiz ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
      const geo = new THREE.PlaneGeometry(r.w, len);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / 20);
      geo.rotateX(-Math.PI / 2);
      if (rect.horiz) geo.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(geo, roadMat);
      m.position.set((rect.minX + rect.maxX) / 2, 0.03, (rect.minZ + rect.maxZ) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
    });

    // roundabout + monument
    const ra = new THREE.Mesh(new THREE.CircleGeometry(ROUNDABOUT.r, 48), asphaltMat);
    ra.rotation.x = -Math.PI / 2;
    ra.position.set(ROUNDABOUT.x, 0.04, ROUNDABOUT.z);
    ra.receiveShadow = true;
    this.scene.add(ra);
    const kerbTex = T.stripes('#f2f2f2', '#151515', 24);
    kerbTex.repeat.set(4, 1);
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(ROUNDABOUT.island, ROUNDABOUT.island, 0.4, 48),
      [new THREE.MeshStandardMaterial({ map: kerbTex }), this.mat('#4f7a32', 1), this.mat('#4f7a32', 1)],
    );
    island.position.set(ROUNDABOUT.x, 0.2, ROUNDABOUT.z);
    island.receiveShadow = true;
    this.scene.add(island);
    this.box(this.scene, 3.2, 2.4, 3.2, 0, 1.4, 0, this.mat('#d9d0bd'));
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 12, 4), this.mat('#cfc6b0', 0.6));
    obelisk.rotation.y = Math.PI / 4;
    obelisk.position.set(0, 8.6, 0);
    obelisk.castShadow = true;
    this.scene.add(obelisk);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 4), this.mat('#d4a93a', 0.3, 0.8));
    cap.rotation.y = Math.PI / 4;
    cap.position.set(0, 15.3, 0);
    this.scene.add(cap);
    this.colliders.push({ minX: -6.5, maxX: 6.5, minZ: -6.5, maxZ: 6.5, h: 3 });

    // parking pads with bay lines
    const lineMat = this.mat('#efefe6', 0.7);
    const lines: THREE.Matrix4[] = [];
    for (const p of PARKING) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), asphaltMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(p.x, 0.025, p.z);
      pad.receiveShadow = true;
      this.scene.add(pad);
      for (let x = p.x - p.w / 2 + 1; x <= p.x + p.w / 2 - 1; x += 3.2) {
        lines.push(new THREE.Matrix4().makeTranslation(x, 0.04, p.z - 2));
      }
    }
    const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.01, 5.5), lineMat, lines.length);
    lines.forEach((m, i) => lm.setMatrixAt(i, m));
    this.scene.add(lm);

    // speed bumps on the boulevard, painted yellow/black
    const bumpTex = T.stripes('#f2c200', '#161616', 14);
    const bumpMat = new THREE.MeshStandardMaterial({ map: bumpTex, roughness: 0.8 });
    for (const z of [205, 150, 60]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 0.9), bumpMat);
      bump.position.set(0, 0.06, z);
      bump.receiveShadow = true;
      this.scene.add(bump);
    }
  }

  sidewalks() {
    const pave = new THREE.MeshStandardMaterial({ map: T.paving(), roughness: 0.9 });
    const tiles: THREE.Matrix4[] = [];
    const kerbs: { m: THREE.Matrix4; white: boolean }[] = [];
    const tmp = new THREE.Object3D();
    ROADS.forEach((r, ri) => {
      const rect = roadRect(r);
      const start = rect.horiz ? rect.minX : rect.minZ;
      const end = rect.horiz ? rect.maxX : rect.maxZ;
      const centre = rect.horiz ? r.z1 : r.x1;
      if (r.name === 'Oke-Ayo Expressway') return;
      for (const side of [-1, 1]) {
        if (r.sidewalk) {
          const off = centre + side * (r.w / 2 + 1.7);
          for (let t = start + 2; t < end; t += 4) {
            const x = rect.horiz ? t : off;
            const z = rect.horiz ? off : t;
            if (roadAt(x, z, 1.8, ri) !== -1) continue;
            if (Math.abs(z - GATE.z) < 2 && Math.abs(x) > 12) continue;
            tmp.position.set(x, 0.04, z);
            tmp.rotation.set(0, rect.horiz ? Math.PI / 2 : 0, 0);
            tmp.updateMatrix();
            tiles.push(tmp.matrix.clone());
          }
        }
        const koff = centre + side * (r.w / 2 + 0.15);
        let i = 0;
        for (let t = start + 0.5; t < end; t += 1, i++) {
          const x = rect.horiz ? t : koff;
          const z = rect.horiz ? koff : t;
          if (roadAt(x, z, 0.4, ri) !== -1) continue;
          tmp.position.set(x, 0.1, z);
          tmp.rotation.set(0, rect.horiz ? Math.PI / 2 : 0, 0);
          tmp.updateMatrix();
          kerbs.push({ m: tmp.matrix.clone(), white: i % 2 === 0 });
        }
      }
    });
    const tileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.08, 4), pave, tiles.length);
    tiles.forEach((m, i) => tileMesh.setMatrixAt(i, m));
    tileMesh.receiveShadow = true;
    this.scene.add(tileMesh);

    const kerbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.22, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), kerbs.length);
    const white = new THREE.Color('#f1f1ea');
    const black = new THREE.Color('#1a1a1a');
    kerbs.forEach((k, i) => {
      kerbMesh.setMatrixAt(i, k.m);
      kerbMesh.setColorAt(i, k.white ? white : black);
    });
    kerbMesh.receiveShadow = true;
    this.scene.add(kerbMesh);
  }

  // ---------- buildings ----------
  private facadeMat(b: BuildingDef, style: 'window' | 'strip' | 'hostel', glass = '#5f87a6') {
    const { map, emissive } = T.facade(b.wall, glass, style);
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.82 });
    this.night.push({ mat: m, max: 0.9 });
    return m;
  }

  private shell(b: BuildingDef, style: 'window' | 'strip' | 'hostel', roofColor = '#8e8a83') {
    const f = this.facadeMat(b, style);
    const roofTex = T.plain(roofColor, 0.15);
    const roof = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 });
    const mesh = new THREE.Mesh(worldBox(b.w, b.h, b.d), [f, f, roof, roof, f, f]);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // cornice band
    this.box(this.scene, b.w + 0.8, 0.7, b.d + 0.8, b.x, b.h + 0.1, b.z, this.mat('#cdc4b2'));
    // plinth
    this.box(this.scene, b.w + 0.4, 0.6, b.d + 0.4, b.x, 0.3, b.z, this.mat('#7d7468'), false);
    this.colliders.push(buildingBox(b));
  }

  private front(b: BuildingDef, f: Facing = b.facing) {
    const fr = faceFrame(b, f);
    const g = new THREE.Group();
    g.position.set(fr.x, 0, fr.z);
    g.rotation.y = fr.rot;
    this.scene.add(g);
    return { g, width: fr.width };
  }

  private entranceAndSign(b: BuildingDef, signY?: number, signText = b.name.toUpperCase()) {
    const { g, width } = this.front(b);
    const glass = this.mat('#1d2f3d', 0.15, 0.6);
    this.box(g, 4.4, 3.2, 0.3, 0, 1.6, 0.05, glass, false);
    this.box(g, 7.5, 0.35, 3.2, 0, 3.7, 1.6, this.mat('#bdb3a0'));
    this.box(g, 0.25, 3.6, 0.25, -3.4, 1.8, 3, this.mat('#d8d0bf'));
    this.box(g, 0.25, 3.6, 0.25, 3.4, 1.8, 3, this.mat('#d8d0bf'));
    this.box(g, 8, 0.18, 2, 0, 0.09, 1.1, this.mat('#b8b0a2'), false);
    const sw = Math.min(width * 0.75, 20);
    const s = this.signMesh(signText, sw, Math.min(1.8, sw / 6), { bg: '#123f2c', fg: '#f3e2a8', border: '#c9a43a' });
    s.position.set(0, signY ?? Math.min(b.h - 1.6, 5.4), 0.08);
    g.add(s);
    this.pois[b.id] = entrance(b);
    return g;
  }

  private roofTanks(b: BuildingDef, n = 2) {
    const tank = this.mat('#1b1c1f', 0.6);
    for (let i = 0; i < n; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.7, 14), tank);
      t.position.set(b.x - b.w / 2 + 3 + i * 2.4, b.h + 1.3, b.z - b.d / 2 + 3);
      t.castShadow = true;
      this.scene.add(t);
    }
  }

  private columns(g: THREE.Object3D, n: number, spacing: number, height: number, z: number) {
    const m = this.mat('#f5efe2', 0.6);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, height, 14), m);
      c.position.set((i - (n - 1) / 2) * spacing, height / 2, z);
      c.castShadow = true;
      g.add(c);
    }
    this.box(g, n * spacing + 2, 1.2, z + 2.5, 0, height + 0.6, (z + 2.5) / 2 - 0.5, this.mat('#efe6d3'));
  }

  buildings() {
    for (const b of BUILDINGS) {
      switch (b.kind) {
        case 'senate':
          this.senate(b);
          break;
        case 'arena':
          this.shell(b, 'strip');
          this.entranceAndSign(b);
          this.arenaRoof(b);
          break;
        case 'library': {
          this.shell(b, 'strip');
          const g = this.entranceAndSign(b, b.h - 2);
          const atrium = new THREE.MeshStandardMaterial({ color: '#4b7896', roughness: 0.08, metalness: 0.8, emissive: '#ffd9a0', emissiveIntensity: 0 });
          this.night.push({ mat: atrium, max: 0.6 });
          const a = new THREE.Mesh(new THREE.BoxGeometry(14, b.h - 3, 4), atrium);
          a.position.set(0, (b.h - 3) / 2 + 0.6, 2);
          a.castShadow = true;
          g.add(a);
          this.roofTanks(b);
          break;
        }
        case 'theatre':
          this.shell(b, 'strip');
          this.entranceAndSign(b, b.h - 2.2, '1000-SEATER LECTURE THEATRE');
          break;
        case 'hospital':
          this.hospital(b);
          break;
        case 'chapel':
          this.chapel(b);
          break;
        case 'mosque':
          this.mosque(b);
          break;
        case 'admin': {
          this.shell(b, 'window');
          const g = this.entranceAndSign(b, b.h - 1.8);
          this.columns(g, 4, 4.5, 7, 4);
          this.roofTanks(b, 3);
          break;
        }
        case 'cafeteria':
          this.cafeteria(b);
          break;
        case 'shops':
          this.shops(b);
          break;
        case 'hostel':
          this.hostel(b);
          break;
        default:
          this.shell(b, b.id === 'sciences' ? 'strip' : 'window');
          this.entranceAndSign(b);
          this.roofTanks(b, 2);
      }
    }
  }

  private senate(b: BuildingDef) {
    this.shell(b, 'window');
    const g = this.entranceAndSign(b, 12.9, 'SENATE BUILDING');
    this.columns(g, 8, 4, 11.4, 5);
    for (let i = 0; i < 3; i++) this.box(g, 34 - i * 2, 0.3, 3 - i * 0.6, 0, 0.15 + i * 0.3, 10 - i * 0.6, this.mat('#d8cfbd'), false);
    // clock tower
    const tower = this.box(this.scene, 11, 16, 11, b.x, b.h + 8, b.z, this.mat('#efe4cc'));
    tower.castShadow = true;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(8.6, 7, 4), this.mat('#7b2f22', 0.7));
    spire.rotation.y = Math.PI / 4;
    spire.position.set(b.x, b.h + 19.5, b.z);
    spire.castShadow = true;
    this.scene.add(spire);
    const clockMat = new THREE.MeshStandardMaterial({ map: T.clockFace(), transparent: true, emissive: '#fff4d6', emissiveIntensity: 0 });
    this.night.push({ mat: clockMat, max: 0.5 });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(3, 32), clockMat);
      const a = (i * Math.PI) / 2;
      c.position.set(b.x + Math.sin(a) * 5.56, b.h + 11, b.z + Math.cos(a) * 5.56);
      c.rotation.y = a;
      this.scene.add(c);
    }
    // flag line on the front lawn
    const poleMat = this.mat('#d9d9d9', 0.3, 0.8);
    const flags = [T.flagNigeria(), T.flagUni(), T.flagNigeria()];
    flags.forEach((tex, i) => {
      const x = (i - 1) * 9;
      const z = b.z + b.d / 2 + 22;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 13, 8), poleMat);
      pole.position.set(x, 6.5, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      flag.position.set(x + 1.55, 12, z);
      flag.castShadow = true;
      flag.userData.flag = true;
      this.scene.add(flag);
    });
  }

  private arenaRoof(b: BuildingDef) {
    const geo = new THREE.CylinderGeometry(b.d / 2 + 1, b.d / 2 + 1, b.w + 2, 32, 1, false, 0, Math.PI);
    geo.rotateZ(Math.PI / 2);
    const roof = new THREE.Mesh(geo, this.mat('#9aa4aa', 0.35, 0.7));
    roof.scale.set(1, 0.32, 1);
    roof.position.set(b.x, b.h + 0.3, b.z);
    roof.castShadow = true;
    this.scene.add(roof);
  }

  private hospital(b: BuildingDef) {
    this.shell(b, 'window');
    const g = this.entranceAndSign(b, 5.6, 'BASE MEDICAL CENTRE');
    const crossTex = T.sign('+', { bg: '#ffffff', fg: '#d32f2f', w: 256, h: 256 });
    const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, emissive: '#ffffff', emissiveMap: crossTex, emissiveIntensity: 0 });
    this.night.push({ mat: crossMat, max: 0.8 });
    for (const x of [-b.w / 2 + 4, b.w / 2 - 4]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), crossMat);
      c.position.set(x, b.h - 4, 0.1);
      g.add(c);
    }
    const helipad = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshStandardMaterial({ map: T.sign('H', { bg: '#3b4a3f', fg: '#ffffff', w: 256, h: 256 }) }));
    helipad.rotation.x = -Math.PI / 2;
    helipad.position.set(b.x + 10, b.h + 0.5, b.z);
    this.scene.add(helipad);
    // A&E canopy
    this.box(g, 12, 0.4, 7, b.w / 2 - 10, 4, 3.5, this.mat('#c62828', 0.7));
  }

  private chapel(b: BuildingDef) {
    this.shell(b, 'window');
    this.entranceAndSign(b, b.h - 1.6);
    const roof = new THREE.Mesh(prismGeo(b.w + 2, b.d + 2, 8), this.mat('#8a3a28', 0.75));
    roof.position.set(b.x, b.h + 0.4, b.z);
    roof.castShadow = true;
    this.scene.add(roof);
    const tx = b.x - b.w / 2 + 3;
    const tz = b.z + b.d / 2 - 3;
    this.box(this.scene, 6, 24, 6, tx, 12, tz, this.mat('#f4efe6'));
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.4, 9, 4), this.mat('#8a3a28', 0.75));
    spire.rotation.y = Math.PI / 4;
    spire.position.set(tx, 28.5, tz);
    spire.castShadow = true;
    this.scene.add(spire);
    const cross = this.mat('#f6f1e4', 0.4);
    this.box(this.scene, 0.4, 3.2, 0.4, tx, 34.6, tz, cross);
    this.box(this.scene, 1.8, 0.4, 0.4, tx, 35.4, tz, cross);
    this.box(this.scene, 0.35, 3, 0.35, b.x, b.h + 9.8, b.z + b.d / 2 + 1, cross);
    this.box(this.scene, 1.6, 0.35, 0.35, b.x, b.h + 10.4, b.z + b.d / 2 + 1, cross);
  }

  private mosque(b: BuildingDef) {
    this.shell(b, 'window');
    this.entranceAndSign(b, b.h - 1.6);
    const green = this.mat('#1f7a4a', 0.35, 0.3);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 2, 32), this.mat('#f1ece0'));
    drum.position.set(b.x, b.h + 1, b.z);
    this.scene.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), green);
    dome.position.set(b.x, b.h + 2, b.z);
    dome.castShadow = true;
    this.scene.add(dome);
    const gold = this.mat('#d4a93a', 0.3, 0.8);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 8), gold);
    fin.position.set(b.x, b.h + 10.6, b.z);
    this.scene.add(fin);
    const mx = b.x + b.w / 2 - 2;
    const mz = b.z - b.d / 2 + 2;
    const minaret = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 28, 12), this.mat('#f1ece0'));
    minaret.position.set(mx, 14, mz);
    minaret.castShadow = true;
    this.scene.add(minaret);
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 16), green);
    balcony.position.set(mx, 22, mz);
    this.scene.add(balcony);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), green);
    top.position.set(mx, 28, mz);
    this.scene.add(top);
    this.colliders.push({ minX: mx - 1.6, maxX: mx + 1.6, minZ: mz - 1.6, maxZ: mz + 1.6, h: 28 });
  }

  private cafeteria(b: BuildingDef) {
    this.shell(b, 'strip');
    const g = this.entranceAndSign(b, 5.4, 'CENTRAL CAFETERIA');
    this.box(g, b.d - 2, 0.4, 7, 0, 4.2, 3.5, this.mat('#2e7d4f', 0.7));
    for (const x of [-(b.d / 2) + 2, b.d / 2 - 2]) this.box(g, 0.25, 4.2, 0.25, x, 2.1, 6.8, this.mat('#d8d0bf'));
    const colours = ['#c62828', '#f5f5f5', '#2e7d32'];
    const chairMat = this.mat('#e8e8e8', 0.6);
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * 6;
      const z = 11 + Math.floor(i / 3) * 6;
      this.box(g, 0.12, 0.75, 0.12, x, 0.37, z, this.mat('#cccccc', 0.4, 0.5), false);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 20), this.mat('#f2f2f2', 0.5));
      top.position.set(x, 0.76, z);
      g.add(top);
      this.box(g, 0.06, 2.4, 0.06, x, 1.2, z, this.mat('#9a9a9a'), false);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8), this.mat(colours[i % 3], 0.8));
      umb.position.set(x, 2.5, z);
      umb.castShadow = true;
      g.add(umb);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        this.box(g, 0.45, 0.5, 0.45, x + Math.sin(a) * 1.3, 0.25, z + Math.cos(a) * 1.3, chairMat, false);
      }
    }
  }

  private shops(b: BuildingDef) {
    const units = SHOP_SIGNS.length;
    const uw = b.w / units;
    const zinc = T.stripes('#9aa0a3', '#7d8285', 40);
    const roofMat = new THREE.MeshStandardMaterial({ map: zinc, roughness: 0.5, metalness: 0.5 });
    SHOP_SIGNS.forEach((s, i) => {
      const x = b.x - b.w / 2 + uw * i + uw / 2;
      const unit = new THREE.Mesh(new THREE.BoxGeometry(uw - 0.3, b.h, b.d), this.mat(i % 2 ? '#f1ece2' : '#ece4d4'));
      unit.position.set(x, b.h / 2, b.z);
      unit.castShadow = true;
      unit.receiveShadow = true;
      this.scene.add(unit);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(uw, 0.2, b.d + 2), roofMat);
      roof.position.set(x, b.h + 0.1, b.z);
      roof.rotation.x = 0.06;
      this.scene.add(roof);
      const fz = b.z - b.d / 2;
      this.box(this.scene, uw - 2, 2.8, 0.2, x, 1.5, fz - 0.05, this.mat('#1c1c1c', 0.6), false);
      const awning = this.box(this.scene, uw - 0.6, 0.15, 2.2, x, 3.3, fz - 1.1, this.mat(s.color, 0.8));
      awning.rotation.x = -0.18;
      const sg = this.signMesh(s.name, uw - 1, 1.1, { bg: s.color, fg: '#ffffff' });
      sg.position.set(x, 4.25, fz - 0.06);
      sg.rotation.y = Math.PI;
      this.scene.add(sg);
      if (s.name === 'ATM GALLERY') {
        for (const dx of [-1.2, 1.2]) {
          const atm = this.box(this.scene, 0.9, 1.7, 0.6, x + dx, 0.85, fz - 0.4, this.mat('#0e5a35', 0.5, 0.3));
          atm.castShadow = true;
          const screen = this.box(this.scene, 0.5, 0.35, 0.02, x + dx, 1.3, fz - 0.71, new THREE.MeshStandardMaterial({ color: '#7fd1ff', emissive: '#4fb3ff', emissiveIntensity: 0.8 }), false);
          screen.castShadow = false;
        }
        this.pois.atm = new THREE.Vector3(x, 0, fz - 2.2);
      }
    });
    this.colliders.push(buildingBox(b));
    this.pois[b.id] = entrance(b);
  }

  private hostel(b: BuildingDef) {
    const female = b.name.includes('Female');
    this.shell(b, 'hostel');
    this.entranceAndSign(b, 2.2 + 3.6 * 3 + 1.6, b.name.split(' (')[0].toUpperCase());
    const roof = new THREE.Mesh(prismGeo(b.w + 2, b.d + 2, 5), this.mat(female ? '#8c3b4a' : '#7b3324', 0.75));
    roof.position.set(b.x, b.h + 0.4, b.z);
    roof.castShadow = true;
    this.scene.add(roof);
    // balconies with hanging laundry
    const { g, width } = this.front(b);
    const slab = this.mat('#d9d2c2');
    const rail = this.mat('#f2efe8', 0.5);
    const laundry = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#ffffff', '#8e24aa', '#fb8c00'];
    for (let floor = 1; floor < 4; floor++) {
      const y = floor * 3.6;
      this.box(g, width - 2, 0.25, 1.6, 0, y, 0.8, slab);
      this.box(g, width - 2, 1, 0.08, 0, y + 0.6, 1.56, rail, false);
      for (let k = 0; k < 9; k++) {
        if (this.rand() < 0.45) continue;
        const cloth = this.box(g, 0.6, 0.8, 0.03, -width / 2 + 3 + this.rand() * (width - 6), y + 0.75, 1.62, this.mat(laundry[k % laundry.length], 0.95), false);
        cloth.rotation.z = (this.rand() - 0.5) * 0.2;
      }
    }
    // overhead water tanks on a stand, beside the hall
    const side = b.x < 0 ? 1 : -1;
    const sx = b.x + side * (b.w / 2 - 3);
    const sz = b.z - b.d / 2 - 5;
    for (const dx of [-2, 2]) this.box(this.scene, 0.3, 6, 0.3, sx + dx, 3, sz, this.mat('#555555', 0.5, 0.6));
    this.box(this.scene, 5, 0.3, 3, sx, 6.1, sz, this.mat('#555555', 0.5, 0.6));
    for (const dx of [-1.2, 1.2]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.9, 14), this.mat('#1b1c1f', 0.6));
      t.position.set(sx + dx, 7.2, sz);
      t.castShadow = true;
      this.scene.add(t);
    }
    // generator house
    const gx = b.x + side * (b.w / 2 - 4);
    const gz = b.z + b.d / 2 + 6;
    this.box(this.scene, 6, 3, 4, gx, 1.5, gz, this.mat('#cfc7b5'));
    this.colliders.push({ minX: gx - 3, maxX: gx + 3, minZ: gz - 2, maxZ: gz + 2, h: 3 });
  }

  // ---------- gate & perimeter wall ----------
  gateAndFence() {
    const wall = this.mat('#e7dcc4');
    const coping = this.mat('#2f6b47', 0.7);
    const segs: [number, number, number, number][] = [
      [-FENCE, GATE.z, -19.5, GATE.z],
      [19.5, GATE.z, FENCE, GATE.z],
      [-FENCE, -FENCE, FENCE, -FENCE],
      [-FENCE, -FENCE, -FENCE, GATE.z],
      [FENCE, -FENCE, FENCE, GATE.z],
    ];
    for (const [x1, z1, x2, z2] of segs) {
      const horiz = z1 === z2;
      const len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      const w = horiz ? len : 0.4;
      const d = horiz ? 0.4 : len;
      this.box(this.scene, w, 2.6, d, cx, 1.3, cz, wall);
      this.box(this.scene, w + 0.2, 0.2, d + 0.2, cx, 2.7, cz, coping);
      this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: 2.6 });
    }

    const gold = this.mat('#d4a93a', 0.35, 0.8);
    const pillar = this.mat('#efe4cc', 0.7);
    for (const x of [-11.5, 11.5]) {
      this.box(this.scene, 3, 13, 3, x, 6.5, GATE.z, pillar);
      this.box(this.scene, 3.6, 0.8, 3.6, x, 13.4, GATE.z, gold);
      this.colliders.push({ minX: x - 1.5, maxX: x + 1.5, minZ: GATE.z - 1.5, maxZ: GATE.z + 1.5, h: 13 });
    }
    for (const x of [-18, 18]) {
      this.box(this.scene, 2, 6, 2, x, 3, GATE.z, pillar);
      this.colliders.push({ minX: x - 1, maxX: x + 1, minZ: GATE.z - 1, maxZ: GATE.z + 1, h: 6 });
    }
    this.box(this.scene, 25, 3.2, 2.4, 0, 11.4, GATE.z, this.mat('#1d3f73', 0.6));
    for (const side of [1, -1]) {
      const s = this.signMesh(UNI.name.toUpperCase(), 21, 2.3, { bg: '#1d3f73', fg: '#f3d27a', sub: UNI.town.toUpperCase(), border: '#d4a93a' });
      s.position.set(0, 11.4, GATE.z + side * 1.22);
      if (side < 0) s.rotation.y = Math.PI;
      this.scene.add(s);
    }
    // security post and boom barrier
    this.box(this.scene, 6, 3.2, 4, 18, 1.6, GATE.z - 6, this.mat('#efe4cc'));
    this.box(this.scene, 7, 0.3, 5, 18, 3.35, GATE.z - 6, this.mat('#2f6b47'));
    this.colliders.push({ minX: 15, maxX: 21, minZ: GATE.z - 8, maxZ: GATE.z - 4, h: 3.2 });
    const sec = this.signMesh('GUARD ROOM', 4, 0.7, { bg: '#1d1d1d', fg: '#ffd54f' });
    sec.position.set(15 - 0.02, 2.6, GATE.z - 6);
    sec.rotation.y = -Math.PI / 2;
    this.scene.add(sec);
    const boomTex = T.stripes('#d32f2f', '#f5f5f5', 10);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(12, 0.18, 0.18), new THREE.MeshStandardMaterial({ map: boomTex }));
    boom.geometry.translate(6, 0, 0);
    boom.position.set(-8, 1.2, GATE.z + 2);
    boom.rotation.z = 1.25;
    boom.castShadow = true;
    this.scene.add(boom);
    this.box(this.scene, 0.5, 1.2, 0.5, -8, 0.6, GATE.z + 2, this.mat('#333333'));
    this.pois.gate = new THREE.Vector3(0, 0, GATE.z - 8);
  }

  // ---------- landmarks ----------
  landmarks() {
    // stadium
    const S = STADIUM;
    const pitchTex = T.sign('', { bg: '#3f7d33', w: 512, h: 332 });
    const ctx = (pitchTex.image as HTMLCanvasElement).getContext('2d')!;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 492, 312);
    ctx.beginPath();
    ctx.moveTo(256, 10);
    ctx.lineTo(256, 322);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 166, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(10, 96, 60, 140);
    ctx.strokeRect(442, 96, 60, 140);
    pitchTex.needsUpdate = true;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(68, 44), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(S.x, 0.035, S.z);
    pitch.receiveShadow = true;
    this.scene.add(pitch);
    const rounded = (w: number, h: number, r: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2);
      s.lineTo(w / 2 - r, -h / 2);
      s.absarc(w / 2 - r, 0, h / 2, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(-w / 2 + r, h / 2);
      s.absarc(-w / 2 + r, 0, h / 2, Math.PI / 2, (3 * Math.PI) / 2, false);
      return s;
    };
    const track = rounded(96, 62, 31);
    track.holes.push(rounded(76, 48, 24) as unknown as THREE.Path);
    const trackMesh = new THREE.Mesh(new THREE.ShapeGeometry(track, 32), this.mat('#a4462f', 0.95));
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(S.x, 0.03, S.z);
    trackMesh.receiveShadow = true;
    this.scene.add(trackMesh);
    const concrete = this.mat('#bdb6a8');
    const seats = [this.mat('#1f5fa8', 0.7), this.mat('#2e7d32', 0.7)];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        this.box(this.scene, 3, 1.5 * (i + 1), 54, S.x + side * (51 + i * 3), 0.75 * (i + 1), S.z, i % 2 ? concrete : seats[(side + 1) / 2]);
      }
      this.colliders.push({ minX: S.x + side * 51 - 1.5 - (side < 0 ? 9 : 0), maxX: S.x + side * 51 + 1.5 + (side > 0 ? 9 : 0), minZ: S.z - 27, maxZ: S.z + 27, h: 6 });
      this.box(this.scene, 14, 0.4, 56, S.x + side * 56, 10, S.z, this.mat('#e8e8e8', 0.5, 0.3));
      for (const dz of [-24, 0, 24]) this.box(this.scene, 0.4, 10, 0.4, S.x + side * 62, 5, S.z + dz, this.mat('#9e9e9e'));
    }
    const floodHead = new THREE.MeshStandardMaterial({ color: '#f5f5f5', emissive: '#ffffff', emissiveIntensity: 0 });
    this.night.push({ mat: floodHead, max: 2.5 });
    for (const [dx, dz] of [[-44, -34], [44, -34], [-44, 34], [44, 34]]) {
      this.box(this.scene, 0.6, 26, 0.6, S.x + dx, 13, S.z + dz, this.mat('#8d8d8d', 0.5, 0.6));
      this.box(this.scene, 3.4, 2.2, 0.5, S.x + dx, 26, S.z + dz, floodHead);
    }
    const ss = this.signMesh('FORCE LIFE SPORTS COMPLEX', 18, 1.6, { bg: '#123f6b', fg: '#ffffff' });
    ss.position.set(S.x, 3, S.z + S.d / 2 + 4);
    this.scene.add(ss);
    this.box(this.scene, 18.4, 0.3, 0.3, S.x, 3.95, S.z + S.d / 2 + 3.95, this.mat('#555555'));
    for (const dx of [-8.5, 8.5]) this.box(this.scene, 0.3, 3.8, 0.3, S.x + dx, 1.9, S.z + S.d / 2 + 3.9, this.mat('#555555'));
    this.pois.stadium = new THREE.Vector3(S.x, 0, S.z + S.d / 2 + 8);

    this.paradeGround();
    this.hangar();
    this.checkpoint();
  }

  // ---------- parade ground ----------
  private paradeGround() {
    const P = PARADE;
    const tex = T.plain('#4a4b4e', 0.18);
    tex.repeat.set(8, 6);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(P.x, 0.03, P.z);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const lines: THREE.Matrix4[] = [];
    for (let x = P.x - P.w / 2 + 2; x <= P.x + P.w / 2 - 2; x += 6) lines.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.045, P.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, P.d - 4)));
    for (let z = P.z - P.d / 2 + 2; z <= P.z + P.d / 2 - 2; z += 6) lines.push(new THREE.Matrix4().compose(new THREE.Vector3(P.x, 0.045, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, P.w - 4)));
    const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.01, 1), this.mat('#e9e6dc', 0.7), lines.length);
    lines.forEach((m, i) => lm.setMatrixAt(i, m));
    this.scene.add(lm);
    // saluting base on the north edge, facing the ground
    const dz = P.z - P.d / 2 - 4;
    this.box(this.scene, 12, 1, 5, P.x, 0.5, dz, this.mat('#d8d2c2'));
    this.box(this.scene, 13, 0.3, 6, P.x, 4.2, dz, this.mat('#1d3f73', 0.6));
    for (const dx of [-6, 6]) this.box(this.scene, 0.3, 3.4, 0.3, P.x + dx, 2.5, dz + 2.6, this.mat('#efeae0'));
    this.colliders.push({ minX: P.x - 6, maxX: P.x + 6, minZ: dz - 2.5, maxZ: dz + 2.5, h: 1 });
    const sb = this.signMesh('SALUTING BASE', 6, 0.7, { bg: '#1d3f73', fg: '#f3d27a' });
    sb.position.set(P.x, 3.6, dz + 2.62);
    this.scene.add(sb);
    // flagpole used for the Retreat ceremony
    const fx = P.x + 10;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 14, 8), this.mat('#d9d9d9', 0.3, 0.8));
    pole.position.set(fx, 7, dz);
    pole.castShadow = true;
    this.scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), new THREE.MeshStandardMaterial({ map: T.flagNigeria(), side: THREE.DoubleSide }));
    flag.geometry.translate(1.5, 0, 0);
    flag.position.set(fx + 0.05, 13, dz);
    flag.userData.flag = true;
    flag.userData.retreat = { top: 13, bottom: 1.6 };
    flag.castShadow = true;
    this.scene.add(flag);
    this.pois.parade = new THREE.Vector3(P.x - 6, 0, dz + 5);
  }

  // ---------- hangar, apron and static aircraft ----------
  private hangar() {
    const H = HANGAR;
    const tex = T.plain('#b9b7b0', 0.12);
    tex.repeat.set(10, 8);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(H.w, H.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(H.x, 0.03, H.z);
    apron.receiveShadow = true;
    this.scene.add(apron);
    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(0.3, H.d - 6), this.mat('#f2c200', 0.7));
    taxi.rotation.x = -Math.PI / 2;
    taxi.position.set(H.x, 0.04, H.z);
    this.scene.add(taxi);
    // hangar: open to the north, arched roof
    const hz = H.z + H.d / 2 - 12;
    const hw = 40;
    const hd = 22;
    const wall = this.mat('#c9ccc8', 0.5, 0.4);
    this.box(this.scene, hw, 9, 0.5, H.x, 4.5, hz + hd / 2, wall);
    for (const sx of [-1, 1]) {
      this.box(this.scene, 0.5, 9, hd, H.x + (sx * hw) / 2, 4.5, hz, wall);
      this.colliders.push({ minX: H.x + (sx * hw) / 2 - 0.3, maxX: H.x + (sx * hw) / 2 + 0.3, minZ: hz - hd / 2, maxZ: hz + hd / 2, h: 9 });
    }
    this.colliders.push({ minX: H.x - hw / 2, maxX: H.x + hw / 2, minZ: hz + hd / 2 - 0.3, maxZ: hz + hd / 2 + 0.3, h: 9 });
    const roofGeo = new THREE.CylinderGeometry(hw / 2 + 0.5, hw / 2 + 0.5, hd + 1, 32, 1, true, -Math.PI / 2, Math.PI);
    roofGeo.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#9aa4aa', roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
    roof.scale.set(1, 0.35, 1);
    roof.position.set(H.x, 9, hz);
    roof.castShadow = true;
    this.scene.add(roof);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw, hd), this.mat('#8d8b85', 0.8));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(H.x, 0.035, hz);
    this.scene.add(floor);
    const hs = this.signMesh('HANGAR 1 · AIR ENGINEERING TRAINING', 22, 1.4, { bg: '#1d3f73', fg: '#ffffff' });
    hs.position.set(H.x, 10.2, hz - hd / 2 - 0.3);
    hs.rotation.y = Math.PI;
    this.scene.add(hs);
    this.aircraft(H.x, hz + 1, Math.PI);
    this.aircraft(H.x - 18, H.z - 16, -0.5);
    this.aircraft(H.x + 16, H.z - 18, 0.4);
    this.pois.hangar = new THREE.Vector3(H.x, 0, H.z - H.d / 2 + 4);
  }

  /** A generic two-seat jet trainer, used as a static instructional airframe. */
  private aircraft(x: number, z: number, yaw: number) {
    const g = new THREE.Group();
    const paint = this.mat('#a4acb2', 0.35, 0.6);
    const dark = this.mat('#2b2f33', 0.5, 0.4);
    // fuselage from tail (y=0) to nose (y=11), turned so the nose points -Z
    const prof = [[0.0, 0], [0.32, 0.05], [0.55, 1.2], [0.72, 3.4], [0.78, 5.6], [0.7, 7.6], [0.5, 9.3], [0.22, 10.6], [0.02, 11]].map(([r, y]) => new THREE.Vector2(r, y));
    const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 18).rotateX(-Math.PI / 2).translate(0, 1.5, 5.5), paint);
    g.add(fus);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10).scale(0.85, 0.75, 2.6), new THREE.MeshStandardMaterial({ color: '#1b2833', roughness: 0.05, metalness: 0.8 }));
    canopy.position.set(0, 2.1, -2.3);
    g.add(canopy);
    const wingShape = new THREE.Shape([new THREE.Vector2(0, 1.6), new THREE.Vector2(4.6, 0.3), new THREE.Vector2(4.6, -0.9), new THREE.Vector2(0, -1.8)]);
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.14, bevelEnabled: false }).rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, paint);
      w.scale.x = sx;
      w.position.set(sx * 0.5, 1.45, 0.4);
      g.add(w);
      const st = new THREE.Mesh(wingGeo, paint);
      st.scale.set(sx * 0.42, 1, 0.42);
      st.position.set(sx * 0.25, 1.65, 4.6);
      g.add(st);
      const intake = this.box(g, 0.35, 0.55, 1.6, sx * 0.72, 1.55, -0.6, dark);
      intake.castShadow = true;
    }
    const finShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-2.2, 0), new THREE.Vector2(-0.6, 2.2), new THREE.Vector2(0.2, 2.2)]);
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false }).rotateY(Math.PI / 2), paint);
    fin.position.set(-0.06, 1.95, 3.4);
    g.add(fin);
    // landing gear
    for (const [gx, gz] of [[0, -3.8], [-1.3, 0.8], [1.3, 0.8]]) {
      this.box(g, 0.1, 1.1, 0.1, gx, 0.85, gz, dark);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 14).rotateZ(Math.PI / 2), dark);
      wheel.position.set(gx, 0.28, gz);
      g.add(wheel);
    }
    // national roundels and a fictional training code
    const roundel = new THREE.MeshStandardMaterial({ map: T.roundel(), transparent: true });
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), roundel);
      r.rotation.x = -Math.PI / 2;
      r.position.set(sx * 3.2, 1.53, 0.2);
      g.add(r);
      const code = this.signMesh('FL-01', 1.6, 0.35, { bg: '#a4acb2', fg: '#1b1b1b' });
      code.position.set(sx * 0.6, 1.6, 2.6);
      code.rotation.y = sx * Math.PI / 2;
      g.add(code);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    this.scene.add(g);
    const c = Math.abs(Math.cos(yaw));
    const s2 = Math.abs(Math.sin(yaw));
    const hx = 5 * c + 4 * s2;
    const hz2 = 5 * s2 + 4 * c;
    this.colliders.push({ minX: x - hx * 0.6, maxX: x + hx * 0.6, minZ: z - hz2 * 0.6, maxZ: z + hz2 * 0.6, h: 3 });
  }

  // ---------- gate checkpoint ----------
  private checkpoint() {
    const drum = new THREE.MeshStandardMaterial({ map: T.stripes('#d32f2f', '#f5f5f5', 6), roughness: 0.6 });
    const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 14);
    for (let z = GATE.z + 8; z <= GATE.z + 20; z += 4) {
      for (const x of [-5.6, 5.6]) {
        const d = new THREE.Mesh(drumGeo, drum);
        d.position.set(x + (z % 8 === 0 ? 0.4 * Math.sign(x) : 0), 0.5, z);
        d.castShadow = true;
        this.scene.add(d);
      }
    }
    const sand = this.mat('#b59b6e', 1);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4 - i; j++) {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 3, 8).rotateZ(Math.PI / 2), sand);
        bag.position.set(-16 + j * 0.95 + i * 0.47, 0.22 + i * 0.4, GATE.z + 4);
        bag.castShadow = true;
        this.scene.add(bag);
      }
    }
    this.colliders.push({ minX: -16.6, maxX: -12.6, minZ: GATE.z + 3.6, maxZ: GATE.z + 4.4, h: 1.2 });
    const stop = this.signMesh('STOP · SHOW YOUR ID', 3.4, 0.9, { bg: '#c62828', fg: '#ffffff' });
    stop.position.set(9.2, 2.2, GATE.z + 12);
    this.scene.add(stop);
    this.box(this.scene, 0.12, 2, 0.12, 9.2, 1, GATE.z + 11.95, this.mat('#555555'));
    this.pois.guard = new THREE.Vector3(12.6, 0, GATE.z - 6);
  }

  // ---------- outside the gate ----------
  outside() {
    const colours = ['#e8d6a8', '#c9e0d4', '#f0c9a0', '#d9c2e0', '#f2e6b3', '#b9d3ea', '#e6b7a9'];
    const rust = new THREE.MeshStandardMaterial({ map: T.stripes('#7d5a44', '#6a4b38', 30), roughness: 0.7, metalness: 0.3 });
    const place = (x: number, z: number, facingNorth: boolean) => {
      const w = 6 + this.rand() * 5;
      const d = 5 + this.rand() * 3;
      const h = 3 + this.rand() * 1.2;
      this.box(this.scene, w, h, d, x, h / 2, z, this.mat(colours[Math.floor(this.rand() * colours.length)]));
      const roof = new THREE.Mesh(prismGeo(d + 1, w + 1, 1.6), rust);
      roof.rotation.y = Math.PI / 2;
      roof.position.set(x, h, z);
      roof.castShadow = true;
      this.scene.add(roof);
      this.box(this.scene, 1.4, 2.2, 0.1, x, 1.1, z + (facingNorth ? -d / 2 - 0.05 : d / 2 + 0.05), this.mat('#3e2a1e'), false);
      this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
    };
    for (let x = -330; x < 330; x += 14 + this.rand() * 8) {
      if (Math.abs(x) < 30 || (x > 40 && x < 80) || (x < -60 && x > -100)) continue;
      place(x, 322 + this.rand() * 4, true);
    }
    for (let x = 60; x < 300; x += 18 + this.rand() * 10) place(x, 275 + this.rand() * 4, false);
    for (let x = -300; x < -60; x += 18 + this.rand() * 10) place(x, 275 + this.rand() * 4, false);

    const billboard = (x: number, text: string, sub: string, bg: string) => {
      for (const dx of [-4, 4]) this.box(this.scene, 0.4, 7, 0.4, x + dx, 3.5, 318, this.mat('#6b6b6b', 0.5, 0.6));
      const s = this.signMesh(text, 14, 5, { bg, fg: '#ffffff', sub });
      s.position.set(x, 9, 317.7);
      s.rotation.y = Math.PI;
      this.scene.add(s);
      this.box(this.scene, 14.4, 5.4, 0.3, x, 9, 318, this.mat('#2b2b2b'));
    };
    billboard(60, 'ADMISSIONS IN PROGRESS', 'Enquiries at the Registry · 2026/2027 session', '#1d3f73');
    billboard(-80, 'AREWA FRESH YOGHURT', 'Cold fura da nono and yoghurt · Made in Kaduna', '#c62828');

    // bus stop
    this.box(this.scene, 6, 0.2, 2.2, -26, 2.6, 290, this.mat('#2f6b47'));
    for (const dx of [-2.8, 2.8]) this.box(this.scene, 0.15, 2.6, 0.15, -26 + dx, 1.3, 290.8, this.mat('#888888'));
    this.box(this.scene, 5, 0.12, 0.6, -26, 0.5, 290.8, this.mat('#cccccc'));
    const bs = this.signMesh('FORCE LIFE GATE BUS STOP', 6, 0.6, { bg: '#f2c200', fg: '#111111' });
    bs.position.set(-26, 3, 288.85);
    bs.rotation.y = Math.PI;
    this.scene.add(bs);
  }

  // ---------- vegetation ----------
  trees() {
    const palmTrunk = new THREE.CylinderGeometry(0.2, 0.32, 8, 7).translate(0, 4, 0);
    const fronds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.PlaneGeometry(4, 0.9, 6, 1);
      leaf.rotateX(-Math.PI / 2);
      leaf.translate(2, 0, 0);
      const pos = leaf.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        pos.setY(v, 0.35 * x - 0.09 * x * x);
      }
      leaf.computeVertexNormals();
      leaf.rotateZ(-0.1 - (i % 3) * 0.12);
      leaf.rotateY((i / 9) * Math.PI * 2);
      leaf.translate(0, 8, 0);
      fronds.push(leaf);
    }
    const frondGeo = mergeGeometries(fronds)!;
    const broadTrunk = new THREE.CylinderGeometry(0.25, 0.38, 4, 7).translate(0, 2, 0);
    const canopy = mergeGeometries([
      new THREE.IcosahedronGeometry(2.8, 1).translate(0, 5.4, 0),
      new THREE.IcosahedronGeometry(2.1, 1).translate(1.4, 4.6, 0.8),
      new THREE.IcosahedronGeometry(1.9, 1).translate(-1.3, 4.8, -0.6),
    ])!;

    const palms: THREE.Matrix4[] = [];
    const broads: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const add = (list: THREE.Matrix4[], x: number, z: number, s: number) => {
      q.setFromEuler(new THREE.Euler((this.rand() - 0.5) * 0.08, this.rand() * Math.PI * 2, (this.rand() - 0.5) * 0.08));
      list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s)));
    };
    // boulevard and avenue palms
    for (let z = 26; z < 238; z += 14) for (const x of [-11.8, 11.8]) add(palms, x, z, 0.9 + this.rand() * 0.25);
    for (let x = -126; x < 128; x += 16) {
      if (Math.abs(x) < 24) continue;
      for (const z of [-10.8, 10.8]) add(palms, x, z, 0.85 + this.rand() * 0.3);
    }
    // ring road palms (inside edge)
    for (let t = -126; t <= 96; t += 20) for (const x of [-129, 129]) if (roadAt(x, t, 3) === -1) add(palms, x, t, 0.9 + this.rand() * 0.3);
    for (let t = -120; t <= 120; t += 20) for (const z of [-129, 99]) if (roadAt(t, z, 3) === -1) add(palms, t, z, 0.9 + this.rand() * 0.3);

    const blocked = (x: number, z: number) => {
      if (roadAt(x, z, 5) !== -1) return true;
      for (const c of this.colliders) if (x > c.minX - 6 && x < c.maxX + 6 && z > c.minZ - 6 && z < c.maxZ + 6) return true;
      for (const b of BUILDINGS) {
        const e = entrance(b, 8);
        if (Math.hypot(x - e.x, z - e.z) < 12) return true;
      }
      if (Math.abs(x - PARADE.x) < PARADE.w / 2 + 6 && Math.abs(z - PARADE.z) < PARADE.d / 2 + 6) return true;
      if (Math.abs(x - HANGAR.x) < HANGAR.w / 2 + 4 && Math.abs(z - HANGAR.z) < HANGAR.d / 2 + 4) return true;
      if (Math.abs(x - STADIUM.x) < 66 && Math.abs(z - STADIUM.z) < 40) return true;
      for (const p of PARKING) if (Math.abs(x - p.x) < p.w / 2 + 3 && Math.abs(z - p.z) < p.d / 2 + 3) return true;
      if (Math.abs(x) < 30 && z > 200) return true;
      if (Math.abs(x) < 40 && z < -30 && z > -80) return true;
      return false;
    };
    let tries = 0;
    while (broads.length + palms.length < 560 && tries++ < 8000) {
      const x = (this.rand() * 2 - 1) * (FENCE - 6);
      const z = (this.rand() * 2 - 1) * (FENCE - 6);
      if (blocked(x, z)) continue;
      if (this.rand() < 0.1) add(palms, x, z, 0.8 + this.rand() * 0.4);
      else add(broads, x, z, 0.8 + this.rand() * 0.7);
    }
    // bush outside the wall
    tries = 0;
    let outsideCount = 0;
    while (outsideCount < 260 && tries++ < 4000) {
      const x = (this.rand() * 2 - 1) * 600;
      const z = (this.rand() * 2 - 1) * 600;
      if (Math.abs(x) < FENCE + 8 && Math.abs(z) < FENCE + 8) continue;
      if (z > 265 && z < 345) continue;
      add(broads, x, z, 0.9 + this.rand() * 0.9);
      outsideCount++;
    }

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colours?: string[]) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const c = new THREE.Color();
      list.forEach((m, i) => {
        im.setMatrixAt(i, m);
        if (colours) im.setColorAt(i, c.set(colours[i % colours.length]));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.scene.add(im);
    };
    mk(palmTrunk, this.mat('#7a6650', 0.95), palms);
    mk(frondGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.8 }), palms, ['#3e6b26', '#4a7a2c', '#557f2e', '#3a5f24']);
    mk(broadTrunk, this.mat('#5b4634', 0.95), broads);
    const onBase = broads.filter((m) => {
      const e = m.elements;
      return Math.abs(e[12]) < FENCE && Math.abs(e[14]) < FENCE;
    });
    mk(new THREE.CylinderGeometry(0.4, 0.42, 1.1, 8).translate(0, 0.55, 0), this.mat('#f2f0ea', 0.9), onBase);
    mk(canopy, new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 }), broads, ['#3d6b2e', '#4b7b33', '#2f5a25', '#5a7f35', '#476f2a']);
  }

  // ---------- street lamps ----------
  lamps() {
    const poleGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.09, 0.14, 8, 8).translate(0, 4, 0),
      new THREE.BoxGeometry(1.8, 0.1, 0.1).translate(0.9, 7.9, 0),
    ])!;
    const headGeo = new THREE.BoxGeometry(0.8, 0.18, 0.38).translate(1.6, 7.8, 0);
    const list: THREE.Matrix4[] = [];
    const tmp = new THREE.Object3D();
    ROADS.forEach((r, ri) => {
      if (!r.sidewalk) return;
      const rect = roadRect(r);
      const start = rect.horiz ? rect.minX : rect.minZ;
      const end = rect.horiz ? rect.maxX : rect.maxZ;
      const centre = rect.horiz ? r.z1 : r.x1;
      let k = 0;
      for (let t = start + 10; t < end - 4; t += 32, k++) {
        const side = k % 2 ? 1 : -1;
        const off = centre + side * (r.w / 2 + 3.6);
        const x = rect.horiz ? t : off;
        const z = rect.horiz ? off : t;
        if (roadAt(x, z, 1, ri) !== -1) continue;
        const nx = rect.horiz ? 0 : -side;
        const nz = rect.horiz ? -side : 0;
        tmp.position.set(x, 0, z);
        tmp.rotation.set(0, Math.atan2(-nz, nx), 0);
        tmp.updateMatrix();
        list.push(tmp.matrix.clone());
      }
    });
    const poles = new THREE.InstancedMesh(poleGeo, this.mat('#5c6166', 0.5, 0.6), list.length);
    const heads = new THREE.InstancedMesh(headGeo, this.lampMat, list.length);
    list.forEach((m, i) => {
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    poles.castShadow = true;
    this.scene.add(poles, heads);
  }

  skyStars() {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = this.rand() * Math.PI * 2;
      const v = Math.acos(this.rand() * 0.95);
      pos[i * 3] = Math.sin(v) * Math.cos(u) * 1800;
      pos[i * 3 + 1] = Math.cos(v) * 1800;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 1800;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }
}
