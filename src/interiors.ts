import * as THREE from 'three';
import { Human, randomLook, SKIN_TONES, KAFTAN_COLOURS } from './human';
import * as T from './textures';
import { mulberry32, type AABB } from './world';

export interface Interior {
  id: string;
  building: string;
  name: string;
  group: THREE.Group;
  centre: THREE.Vector3;
  w: number;
  d: number;
  h: number;
  spawn: THREE.Vector3;
  exit: THREE.Vector3;
  lights: THREE.Vector3[];
  people: Human[];
  fans: THREE.Object3D[];
}

/** Interior points of interest and the building each one is inside. */
export const INTERIOR_POI_BUILDING: Record<string, string> = {
  'room-bed': 'hostelB',
  'lt-seat': 'theatre',
  'caf-counter': 'cafeteria',
};

/**
 * Walk-in interiors (build 0.3). Each room sits far from the campus and is shown
 * only while the player is inside it; doors on campus teleport you in and out.
 */
export class Interiors {
  list: Interior[] = [];
  windowMats: THREE.MeshBasicMaterial[] = [];
  private rand = mulberry32(303);
  private mats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(private scene: THREE.Scene, private colliders: AABB[], private pois: Record<string, THREE.Vector3>) {
    this.hostelRoom();
    this.lectureTheatre();
    this.cafeteria();
    for (const r of this.list) r.group.visible = false;
  }

  byBuilding(id: string) {
    return this.list.find((r) => r.building === id) ?? null;
  }

  containing(p: THREE.Vector3) {
    return this.list.find((r) => Math.abs(p.x - r.centre.x) < r.w / 2 + 1 && Math.abs(p.z - r.centre.z) < r.d / 2 + 1) ?? null;
  }

  update(dt: number, active: Interior | null) {
    if (!active) return;
    for (const f of active.fans) f.rotation.y += dt * 9;
    for (const p of active.people) p.animate(0, dt);
  }

  setDaylight(day: number) {
    const night = new THREE.Color('#0b1626');
    const sky = new THREE.Color('#dfe9f2');
    for (const m of this.windowMats) m.color.copy(night).lerp(sky, day);
  }

  // ---------- helpers ----------
  private mat(color: string, rough = 0.8, metal = 0) {
    const k = color + rough + metal;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.mats.set(k, m);
    }
    return m;
  }

  private box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, collide = false, room?: Interior) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collide && room) {
      const cx = room.centre.x + x;
      const cz = room.centre.z + z;
      this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: y + h / 2 });
    }
    return mesh;
  }

  private plane(parent: THREE.Object3D, w: number, h: number, tex: THREE.Texture | null, x: number, y: number, z: number, rotY = 0, color = '#ffffff') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.7, emissive: tex ? '#ffffff' : '#000000', emissiveMap: tex, emissiveIntensity: tex ? 0.25 : 0 }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    parent.add(m);
    return m;
  }

  /** Shell: floor, ceiling, four walls with a door in the south (+Z) wall. Local coordinates are centred on the room. */
  private shell(id: string, building: string, name: string, slot: number, w: number, d: number, h: number, wall: string, floor: THREE.Texture) {
    const centre = new THREE.Vector3(3000 + slot * 120, 0, 0);
    const group = new THREE.Group();
    group.position.copy(centre);
    this.scene.add(group);
    const room: Interior = {
      id,
      building,
      name,
      group,
      centre,
      w,
      d,
      h,
      spawn: new THREE.Vector3(centre.x, 0, centre.z + d / 2 - Math.min(2.4, d * 0.4)),
      exit: new THREE.Vector3(centre.x, 0, centre.z + d / 2 - 0.7),
      lights: [],
      people: [],
      fans: [],
    };
    floor.repeat.set(w / 2.4, d / 2.4);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floor, roughness: 0.4 }));
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    group.add(f);
    const ceil = this.box(group, w + 0.4, 0.2, d + 0.4, 0, h + 0.1, 0, this.mat('#f1efe9', 0.95));
    ceil.castShadow = true;
    const wm = this.mat(wall, 0.9);
    const t = 0.2;
    this.box(group, w + t * 2, h, t, 0, h / 2, -d / 2 - t / 2, wm, true, room);
    this.box(group, t, h, d, -w / 2 - t / 2, h / 2, 0, wm, true, room);
    this.box(group, t, h, d, w / 2 + t / 2, h / 2, 0, wm, true, room);
    const door = 1.6;
    const side = (w - door) / 2;
    this.box(group, side + t, h, t, -w / 2 + side / 2 - t / 2, h / 2, d / 2 + t / 2, wm, true, room);
    this.box(group, side + t, h, t, w / 2 - side / 2 + t / 2, h / 2, d / 2 + t / 2, wm, true, room);
    this.box(group, door, h - 2.3, t, 0, 2.3 + (h - 2.3) / 2, d / 2 + t / 2, wm);
    // skirting and door frame
    this.box(group, w, 0.12, 0.03, 0, 0.06, -d / 2 + 0.015, this.mat('#5b4a3a'));
    const frame = this.mat('#6b4a2f', 0.6);
    for (const sx of [-1, 1]) this.box(group, 0.08, 2.3, 0.26, sx * (door / 2 + 0.04), 1.15, d / 2, frame);
    this.box(group, door + 0.16, 0.08, 0.26, 0, 2.34, d / 2, frame);
    // daylight beyond the open door
    const outside = new THREE.MeshBasicMaterial({ color: '#dfe9f2' });
    this.windowMats.push(outside);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(door, 2.3), outside);
    glow.position.set(0, 1.15, d / 2 + t + 0.02);
    glow.rotation.y = Math.PI;
    group.add(glow);
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshBasicMaterial({ map: T.sign('EXIT', { bg: '#0b7a3e', fg: '#ffffff', w: 256, h: 84 }) }));
    exitSign.position.set(0, 2.6, d / 2 - 0.01);
    exitSign.rotation.y = Math.PI;
    group.add(exitSign);
    this.list.push(room);
    return room;
  }

  private tube(room: Interior, x: number, z: number) {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: 1.6 });
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.08), m);
    t.position.set(x, room.h - 0.05, z);
    room.group.add(t);
  }

  private fan(room: Interior, x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, room.h, z);
    const m = this.mat('#e8e6e0', 0.5);
    this.box(g, 0.04, 0.5, 0.04, 0, -0.25, 0, m);
    const hub = new THREE.Group();
    hub.position.y = -0.52;
    const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), m);
    hub.add(hubMesh);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.12).translate(0.4, 0, 0), m);
      blade.rotation.y = (i * Math.PI * 2) / 3;
      hub.add(blade);
    }
    g.add(hub);
    room.group.add(g);
    room.fans.push(hub);
  }

  private windowPane(room: Interior, x: number, y: number, z: number, w: number, h: number, rotY: number) {
    const m = new THREE.MeshBasicMaterial({ color: '#dfe9f2' });
    this.windowMats.push(m);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    pane.position.set(x, y, z);
    pane.rotation.y = rotY;
    room.group.add(pane);
    // louvre blades
    const lm = this.mat('#9fb3c2', 0.2, 0.3);
    for (let i = 1; i < 7; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 0.08), lm);
      l.position.set(x, y - h / 2 + (i * h) / 7, z);
      l.rotation.y = rotY;
      l.rotation.x = 0.4;
      room.group.add(l);
    }
  }

  private person(room: Interior, look: ConstructorParameters<typeof Human>[0], x: number, z: number, yaw: number, pose: 'sit' | 'stand', y = 0) {
    const h = new Human(look, false);
    h.group.position.set(x, y, z);
    h.group.rotation.y = yaw;
    if (pose === 'sit') h.sit();
    room.group.add(h.group);
    room.people.push(h);
    return h;
  }

  // ---------- Hostel B, Room B14 ----------
  private hostelRoom() {
    const W = 6;
    const D = 5.6;
    const r = this.shell('room', 'hostelB', 'Hostel B · Room B14', 0, W, D, 3.2, '#d6e2cf', T.tiles('#c9c2b4', '#9a9285', 3));
    const steel = this.mat('#3a4a5a', 0.4, 0.6);
    const foam = ['#2f6fb0', '#2f6fb0', '#b23a48', '#2f6fb0'];
    const sheets = ['#e7c84b', '#f2f2f2', '#7fb3d5', '#e59866'];
    // two double bunks against the side walls
    [-1, 1].forEach((sx, bi) => {
      const x = sx * (W / 2 - 0.5);
      for (const [dx, dz] of [[-0.45, -1.0], [0.45, -1.0], [-0.45, 1.0], [0.45, 1.0]]) this.box(r.group, 0.05, 1.9, 0.05, x + dx, 0.95, dz - 0.3, steel);
      [0.45, 1.45].forEach((y, li) => {
        const k = bi * 2 + li;
        this.box(r.group, 0.9, 0.04, 2.0, x, y - 0.06, -0.3, steel);
        this.box(r.group, 0.88, 0.16, 1.95, x, y + 0.04, -0.3, this.mat(foam[k], 0.9));
        this.box(r.group, 0.9, 0.02, 1.4, x, y + 0.13, 0, this.mat(sheets[k], 0.9));
        this.box(r.group, 0.5, 0.1, 0.32, x, y + 0.17, -1.05, this.mat('#f5f5f5', 0.95));
      });
      const rr = r.centre;
      this.colliders.push({ minX: rr.x + x - 0.5, maxX: rr.x + x + 0.5, minZ: rr.z - 1.35, maxZ: rr.z + 0.75, h: 1.9 });
    });
    // reading tables under the window
    for (const x of [-0.8, 0.8]) {
      this.box(r.group, 1.1, 0.05, 0.6, x, 0.75, -D / 2 + 0.4, this.mat('#8a5a35', 0.6), true, r);
      for (const [dx, dz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) this.box(r.group, 0.04, 0.75, 0.04, x + dx, 0.37, -D / 2 + 0.4 + dz, this.mat('#5b3a22'));
      this.box(r.group, 0.42, 0.05, 0.42, x, 0.45, -D / 2 + 1.05, this.mat('#1f6fb0', 0.5));
      this.box(r.group, 0.42, 0.45, 0.04, x, 0.7, -D / 2 + 1.26, this.mat('#1f6fb0', 0.5));
      for (let i = 0; i < 3; i++) this.box(r.group, 0.16, 0.24 - i * 0.03, 0.04, x - 0.4 + i * 0.05, 0.9, -D / 2 + 0.2, this.mat(['#c0392b', '#1f3b5b', '#2e7d32'][i]));
    }
    this.box(r.group, 0.34, 0.02, 0.24, 0.8, 0.79, -D / 2 + 0.45, this.mat('#222222', 0.3, 0.4));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#fafafa', emissive: '#fff2c4', emissiveIntensity: 1 }));
    lamp.position.set(-0.4, 0.93, -D / 2 + 0.3);
    r.group.add(lamp);
    // wardrobe, buckets, notice
    this.box(r.group, 1.0, 2.0, 0.55, -W / 2 + 0.55, 1.0, D / 2 - 1.2, this.mat('#7a5233', 0.6), true, r);
    const bucketColours = ['#1e88e5', '#e53935', '#43a047'];
    bucketColours.forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 14), this.mat(c, 0.5));
      b.position.set(W / 2 - 0.4 - i * 0.38, 0.16, D / 2 - 0.5);
      b.castShadow = true;
      r.group.add(b);
    });
    this.plane(r.group, 0.7, 0.9, T.board('HOSTEL RULES', ['No cooking in rooms', 'No naked flames or heaters', 'Lights out: 11:00 PM', 'Visitors leave by 7:00 PM', 'Keep your room tidy'], { bg: '#fdfaf0', fg: '#222', accent: '#b71c1c', w: 512, h: 640 }), W / 2 - 0.01, 1.6, 0.9, -Math.PI / 2);
    this.windowPane(r, 0, 1.75, -D / 2 + 0.01, 1.6, 1.1, 0);
    this.box(r.group, 0.5, 1.5, 0.03, -1.1, 1.75, -D / 2 + 0.05, this.mat('#7b1f3a', 0.95));
    this.fan(r, 0, 0.2);
    this.tube(r, 0, -1.2);
    r.lights = [new THREE.Vector3(r.centre.x, 2.8, r.centre.z - 0.5), new THREE.Vector3(r.centre.x, 2.8, r.centre.z + 1.5)];
    this.person(r, randomLook(this.rand, false), -W / 2 + 0.55, -0.9, Math.PI / 2, 'sit');
    this.pois['room-bed'] = new THREE.Vector3(r.centre.x + W / 2 - 1.4, 0, r.centre.z - 0.3);
  }

  // ---------- Lecture Theatre LT1 ----------
  private lectureTheatre() {
    const W = 22;
    const D = 18;
    const H = 6;
    const r = this.shell('lt1', 'theatre', 'Lecture Theatre (LT1)', 1, W, D, H, '#e8e2d2', T.tiles('#b9ab95', '#8f826e', 4));
    // stage, whiteboard, projector screen, podium
    this.box(r.group, 16, 0.4, 3.4, 0, 0.2, -D / 2 + 1.7, this.mat('#6b4a2f', 0.6), true, r);
    this.box(r.group, 6, 1.6, 0.05, -4.5, 2.2, -D / 2 + 0.05, this.mat('#fafafa', 0.3));
    this.plane(
      r.group,
      7.2,
      4,
      T.board('GST 111: Communication in English', ['Week 1: Introduction and course outline', '• Listening and note-taking', '• Reading comprehension strategies', '• Sentence structure and punctuation', 'Continuous assessment: 30%  ·  Exam: 70%'], { bg: '#f7f7f4', fg: '#1d2430', accent: '#1d3f73' }),
      3.8,
      3.1,
      -D / 2 + 0.06,
    );
    this.box(r.group, 0.8, 1.15, 0.6, 5, 0.97, -D / 2 + 2.2, this.mat('#5b3a22', 0.5));
    // rows of seats with writing arms, either side of a centre aisle
    const seatGeo = new THREE.BoxGeometry(0.46, 0.06, 0.45).translate(0, 0.45, 0);
    const backGeo = new THREE.BoxGeometry(0.46, 0.5, 0.05).translate(0, 0.72, 0.21);
    const armGeo = new THREE.BoxGeometry(0.18, 0.03, 0.4).translate(0.26, 0.72, -0.05);
    const seats: THREE.Matrix4[] = [];
    const seatSpots: THREE.Vector3[] = [];
    for (let row = 0; row < 8; row++) {
      const z = -D / 2 + 5 + row * 1.35;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 7; k++) {
          const x = side * (1.6 + k * 0.62);
          seats.push(new THREE.Matrix4().makeTranslation(x, 0, z));
          seatSpots.push(new THREE.Vector3(x, 0, z));
        }
      }
      for (const side of [-1, 1]) {
        const c = r.centre;
        this.colliders.push({ minX: c.x + side * 1.3 - (side < 0 ? 4.1 : 0), maxX: c.x + side * 1.3 + (side > 0 ? 4.1 : 0), minZ: c.z + z - 0.3, maxZ: c.z + z + 0.3, h: 1 });
      }
    }
    for (const [g, c] of [[seatGeo, '#1f4e8c'], [backGeo, '#1f4e8c'], [armGeo, '#c9a777']] as const) {
      const im = new THREE.InstancedMesh(g, this.mat(c, 0.6), seats.length);
      seats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      r.group.add(im);
    }
    // students, seated facing the stage
    seatSpots.forEach((p, i) => {
      if (i === 15 || this.rand() < 0.55) return;
      this.person(r, randomLook(this.rand, this.rand() < 0.45), p.x, p.z + 0.05, 0, 'sit');
    });
    // lecturer in a kaftan and cap
    const lecturer = this.person(r, { skin: SKIN_TONES[3], shirt: KAFTAN_COLOURS[0], bottom: '#3c5a7a', hair: '#111', outfit: 'lecturer' }, 4.2, -D / 2 + 2.6, 0.3, 'stand', 0.4);
    lecturer.group.rotation.y = 0.2;
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) this.windowPane(r, sx * (W / 2 - 0.01), 3.4, -D / 2 + 3 + i * 4, 2.2, 1.6, (-sx * Math.PI) / 2);
    for (const x of [-6, 0, 6]) for (const z of [-4, 2]) this.fan(r, x, z);
    for (const x of [-6, 0, 6]) for (const z of [-6, 0, 5]) this.tube(r, x, z);
    r.lights = [new THREE.Vector3(r.centre.x, 5, r.centre.z - 4), new THREE.Vector3(r.centre.x, 5, r.centre.z + 4)];
    const seat = seatSpots[15];
    this.pois['lt-seat'] = new THREE.Vector3(r.centre.x + seat.x + 0.9, 0, r.centre.z + seat.z + 0.7);
  }

  // ---------- Cafeteria ----------
  private cafeteria() {
    const W = 18;
    const D = 13;
    const r = this.shell('caf', 'cafeteria', 'Cafeteria', 2, W, D, 4, '#f1e6cc', T.tiles('#d8cdb6', '#a99d86', 4));
    // serving counter with food warmers
    const cz = -D / 2 + 1.6;
    this.box(r.group, 10, 1, 0.8, 0, 0.5, cz, this.mat('#b0b7bd', 0.3, 0.6), true, r);
    const foods = ['#d4561f', '#f2efe6', '#e6b422', '#7a4a26', '#a8321e', '#e9e2c4'];
    foods.forEach((c, i) => {
      const x = -4 + i * 1.6;
      this.box(r.group, 1.3, 0.1, 0.55, x, 1.02, cz, this.mat(c, 0.95));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.25, roughness: 0.05 }));
      glass.position.set(x, 1.25, cz);
      r.group.add(glass);
    });
    this.plane(
      r.group,
      6,
      2.4,
      T.board("TODAY'S MENU", ['Jollof rice & chicken ........ ₦1,500', 'Fried rice & plantain ......... ₦1,500', 'Tuwo shinkafa & miyan kuka .. ₦1,300', 'Beans & dodo ......................... ₦1,200', 'Zobo / kunu .......................... ₦300']),
      0,
      2.7,
      -D / 2 + 0.02,
    );
    // staff behind the counter
    for (const x of [-2.5, 1.5]) this.person(r, { skin: SKIN_TONES[Math.floor(this.rand() * 6)], shirt: '#2e7d4f', bottom: '#1b1b1f', hair: '#111', female: true, outfit: 'staff' }, x, -D / 2 + 0.8, 0, 'stand');
    // tables with diners
    for (let i = 0; i < 6; i++) {
      const x = -5.5 + (i % 3) * 5.5;
      const z = -0.5 + Math.floor(i / 3) * 4;
      this.box(r.group, 2.2, 0.06, 1.0, x, 0.76, z, this.mat('#e9e9e4', 0.5), true, r);
      for (const dx of [-0.95, 0.95]) for (const dz of [-0.4, 0.4]) this.box(r.group, 0.05, 0.76, 0.05, x + dx, 0.38, z + dz, this.mat('#9a9a9a', 0.4, 0.6));
      for (const side of [-1, 1]) {
        for (const dx of [-0.6, 0.6]) {
          this.box(r.group, 0.42, 0.05, 0.42, x + dx, 0.45, z + side * 0.85, this.mat('#c62828', 0.6));
          this.box(r.group, 0.42, 0.45, 0.04, x + dx, 0.7, z + side * 1.06, this.mat('#c62828', 0.6));
          if (this.rand() < 0.5) this.person(r, randomLook(this.rand, this.rand() < 0.5), x + dx, z + side * 0.8, side > 0 ? 0 : Math.PI, 'sit');
        }
        for (const dx of [-0.6, 0.6]) {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.03, 16), this.mat(foods[Math.floor(this.rand() * 3)], 0.8));
          plate.position.set(x + dx, 0.81, z + side * 0.25);
          r.group.add(plate);
        }
      }
    }
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) this.windowPane(r, sx * (W / 2 - 0.01), 2.1, -2 + i * 3.5, 2, 1.4, (-sx * Math.PI) / 2);
    for (const x of [-5, 0, 5]) for (const z of [-1, 3.5]) this.fan(r, x, z);
    for (const x of [-5, 0, 5]) this.tube(r, x, -3);
    r.lights = [new THREE.Vector3(r.centre.x - 3, 3.5, r.centre.z - 1), new THREE.Vector3(r.centre.x + 3, 3.5, r.centre.z + 3)];
    this.pois['caf-counter'] = new THREE.Vector3(r.centre.x - 1, 0, r.centre.z + cz + 1.1);
  }
}
