import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Outfit = 'civil' | 'airman' | 'lecturer' | 'staff' | 'kaftan';
export type HairStyle = 'low' | 'fade' | 'afro' | 'braids' | 'bun' | 'cap';

export interface HumanLook {
  skin: string;
  shirt: string;
  bottom: string;
  hair: string;
  female?: boolean;
  backpack?: string;
  shoes?: string;
  outfit?: Outfit;
  hairStyle?: HairStyle;
  glasses?: boolean;
  /** 'ankara' paints the top in a bright wax-print pattern */
  pattern?: 'plain' | 'ankara';
}

const ANKARA = ['#e4572e', '#17bebb', '#ffc914', '#76b041', '#7b2d8b', '#2e294e'];

const CAMO = ['#5b7392', '#3f5672', '#8197b3', '#2d3d55'];
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const tmpColor = new THREE.Color();

type Paint = string | string[];
/** Non-indexed copy of g with a vertex colour. An array paints each triangle a random pick (camouflage). */
function paint(g: THREE.BufferGeometry, color: Paint): THREE.BufferGeometry {
  const geom = g.index ? g.toNonIndexed() : g.clone();
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    tmpColor.set(Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color);
    for (let k = 0; k < 3 && i + k < n; k++) arr.set([tmpColor.r, tmpColor.g, tmpColor.b], (i + k) * 3);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}
function meshOf(parts: THREE.BufferGeometry[], shadows: boolean) {
  const m = new THREE.Mesh(mergeGeometries(parts)!, material);
  m.castShadow = shadows;
  return m;
}
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8).translate(0, -len / 2 - r * 0.4, 0);

export const SKIN_TONES = ['#4a2e1d', '#5a3825', '#6b4329', '#7a4d2e', '#8a5a3a', '#3f2618'];
export const SHIRTS = ['#ffffff', '#f4f4f4', '#cfe3f5', '#dfe8d5', '#f5e6c8', '#e8d5e8', '#b3cde0', '#1f3b5b', '#7a1e2c'];
export const TROUSERS = ['#1b1b1f', '#20283a', '#3b3b3b', '#7a6a4f', '#2a2f3a'];
export const SKIRTS = ['#1b1b1f', '#20283a', '#5b2a6e', '#b5562a', '#1f6b5a', '#8b1e3f', '#c79a2b'];
export const HAIR = ['#120d0a', '#1a120d', '#24170f'];
export const KAFTAN_COLOURS = ['#f2efe6', '#d9e4ef', '#cbb994', '#3c5a7a', '#6b4f3a'];

type Style = 'walk' | 'march';

/**
 * Jointed low-poly person (build 0.3): hips, knees, shoulders and elbows,
 * a simple face, and outfits for students, airmen, lecturers and staff. Faces -Z.
 */
export class Human {
  group = new THREE.Group();
  private root = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elL = new THREE.Group();
  private elR = new THREE.Group();
  private phase = Math.random() * 10;
  private seated = false;
  style: Style = 'walk';

  constructor(public look: HumanLook, shadows = true) {
    const outfit = look.outfit ?? 'civil';
    const skin = look.skin;
    const top: Paint = outfit === 'airman' ? CAMO : look.pattern === 'ankara' ? ANKARA : look.shirt;
    const bottom: Paint = outfit === 'airman' ? CAMO : look.bottom;
    const shoe = outfit === 'airman' ? '#0d0d0d' : look.shoes ?? '#151515';
    const female = !!look.female;
    const legColor: Paint = female && outfit === 'civil' ? skin : bottom;

    this.group.add(this.root);
    this.root.position.y = 0.95;

    for (const [hip, knee, x] of [[this.hipL, this.kneeL, -0.1], [this.hipR, this.kneeR, 0.1]] as const) {
      hip.position.set(x, 0, 0);
      hip.add(meshOf([paint(capsule(0.078, 0.3), legColor)], shadows));
      knee.position.y = -0.45;
      const foot = outfit === 'airman' ? new THREE.BoxGeometry(0.12, 0.14, 0.27).translate(0, -0.44, -0.04) : new THREE.BoxGeometry(0.11, 0.08, 0.25).translate(0, -0.47, -0.05);
      knee.add(meshOf([paint(capsule(0.064, 0.32), legColor), paint(foot, shoe)], shadows));
      hip.add(knee);
      this.root.add(hip);
    }
    this.root.add(meshOf([paint(new THREE.CapsuleGeometry(0.15, 0.1, 3, 8).rotateZ(Math.PI / 2).scale(1, 1, 0.75).translate(0, 0.02, 0), bottom)], shadows));

    this.torso.position.y = 0.06;
    this.root.add(this.torso);
    const body: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(0.21, 0.17, 0.52, 12).scale(1, 1, 0.62).translate(0, 0.27, 0), top),
      paint(new THREE.CapsuleGeometry(0.08, 0.3, 3, 8).rotateZ(Math.PI / 2).translate(0, 0.5, 0), top),
    ];
    if (outfit === 'lecturer' || outfit === 'kaftan') body.push(paint(new THREE.CylinderGeometry(0.22, 0.34, 1.05, 12).translate(0, -0.45, 0), top));
    else if (female && outfit === 'civil') body.push(paint(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 12).translate(0, -0.32, 0), bottom));
    if (outfit === 'staff') body.push(paint(new THREE.BoxGeometry(0.34, 0.75, 0.02).translate(0, 0, -0.14), '#f5f5f5'));
    if (outfit === 'airman') body.push(paint(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12).scale(1, 1, 0.65).translate(0, 0.02, 0), '#1a1a1a'));
    if (look.backpack) body.push(paint(new THREE.BoxGeometry(0.32, 0.4, 0.15).translate(0, 0.27, 0.17), look.backpack));
    this.torso.add(meshOf(body, shadows));

    const shortSleeves = outfit === 'civil' || outfit === 'staff';
    for (const [sh, el, x] of [[this.shL, this.elL, -0.25], [this.shR, this.elR, 0.25]] as const) {
      sh.position.set(x, 0.5, 0);
      sh.add(meshOf([paint(capsule(0.055, 0.2), top)], shadows));
      el.position.y = -0.3;
      el.add(meshOf([paint(capsule(0.047, 0.2), shortSleeves ? skin : top), paint(new THREE.SphereGeometry(0.05, 8, 6).scale(0.9, 1.2, 0.7).translate(0, -0.31, 0), skin)], shadows));
      sh.add(el);
      this.torso.add(sh);
    }

    this.head.position.y = 0.56;
    this.torso.add(this.head);
    const head: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8).translate(0, 0.03, 0), skin),
      paint(new THREE.SphereGeometry(0.115, 16, 12).scale(0.95, 1.15, 1.05).translate(0, 0.17, 0), skin),
      paint(new THREE.SphereGeometry(0.022, 6, 4).scale(1, 0.9, 0.8).translate(0, 0.155, -0.118), skin),
    ];
    for (const x of [-0.04, 0.04]) head.push(paint(new THREE.SphereGeometry(0.015, 6, 4).translate(x, 0.19, -0.104), '#0c0c0c'));
    for (const x of [-0.112, 0.112]) head.push(paint(new THREE.SphereGeometry(0.025, 6, 4).scale(0.5, 1, 0.8).translate(x, 0.17, 0), skin));
    if (outfit === 'airman') {
      head.push(paint(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.45, 1.05).rotateZ(-0.18).translate(0.012, 0.25, 0), '#1d2f5a'));
    } else if (outfit === 'lecturer' && !female) {
      head.push(paint(new THREE.CylinderGeometry(0.11, 0.115, 0.1, 12).translate(0, 0.29, 0), look.bottom));
    } else if (outfit === 'staff') {
      head.push(paint(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.19, 0), '#e8e8e8'));
    } else {
      const style = look.hairStyle ?? (female ? 'braids' : 'low');
      const cap = (th: number, r = 0.12) => new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * th).translate(0, 0.19, 0);
      switch (style) {
        case 'fade':
          head.push(paint(cap(0.3, 0.118), look.hair));
          break;
        case 'afro':
          head.push(paint(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1.05, 0.95, 1.05).translate(0, 0.2, 0.01), look.hair));
          break;
        case 'braids':
          head.push(paint(cap(0.6, 0.135), look.hair));
          head.push(paint(new THREE.CylinderGeometry(0.1, 0.06, 0.28, 10).scale(1, 1, 0.6).translate(0, 0.06, 0.08), look.hair));
          break;
        case 'bun':
          head.push(paint(cap(0.55, 0.13), look.hair));
          head.push(paint(new THREE.SphereGeometry(0.075, 10, 8).translate(0, 0.31, 0.06), look.hair));
          break;
        case 'cap':
          head.push(paint(new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 0.2, 0), '#1d3f73'));
          head.push(paint(new THREE.BoxGeometry(0.2, 0.015, 0.12).translate(0, 0.205, -0.15), '#1d3f73'));
          break;
        default:
          head.push(paint(cap(0.4), look.hair));
      }
    }
    if (look.glasses) {
      for (const x of [-0.045, 0.045]) head.push(paint(new THREE.BoxGeometry(0.06, 0.04, 0.01).translate(x, 0.19, -0.118), '#111111'));
      head.push(paint(new THREE.BoxGeometry(0.03, 0.008, 0.01).translate(0, 0.195, -0.118), '#111111'));
    }
    this.head.add(meshOf(head, shadows));
  }

  /** Seated pose, for lecture theatres and the cafeteria. */
  sit(seatHeight = 0.46) {
    this.seated = true;
    this.root.position.y = seatHeight + 0.05;
    for (const h of [this.hipL, this.hipR]) h.rotation.x = Math.PI / 2;
    for (const k of [this.kneeL, this.kneeR]) k.rotation.x = -Math.PI / 2;
    this.shL.rotation.x = this.shR.rotation.x = 0.5;
    this.elL.rotation.x = this.elR.rotation.x = 0.9;
  }

  /** Stand to attention (Retreat, guards). */
  attention() {
    this.hipL.rotation.x = this.hipR.rotation.x = 0;
    this.kneeL.rotation.x = this.kneeR.rotation.x = 0;
    this.shL.rotation.set(0, 0, 0.05);
    this.shR.rotation.set(0, 0, -0.05);
    this.elL.rotation.x = this.elR.rotation.x = 0;
    this.torso.rotation.x = 0;
    this.root.position.y = 0.95;
  }

  /** speed in m/s */
  animate(speed: number, dt: number) {
    if (this.seated) {
      this.phase += dt;
      this.head.rotation.y = Math.sin(this.phase * 0.4) * 0.25;
      this.torso.rotation.x = Math.sin(this.phase * 0.7) * 0.02;
      return;
    }
    const amt = Math.min(1, speed / 2.6);
    const run = Math.min(1, Math.max(0, (speed - 3) / 3));
    const march = this.style === 'march';
    this.phase += dt * (march ? 7 : 3 + speed * 1.9);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const swing = (0.5 + run * 0.35) * amt;
    this.hipL.rotation.x = s * swing * (march ? 1.3 : 1);
    this.hipR.rotation.x = -s * swing * (march ? 1.3 : 1);
    // the knee bends while the leg swings forward
    this.kneeL.rotation.x = -Math.max(0, -c) * (0.55 + run * 0.7) * amt;
    this.kneeR.rotation.x = -Math.max(0, c) * (0.55 + run * 0.7) * amt;
    const arm = march ? 0.9 : (0.45 + run * 0.4) * amt;
    this.shL.rotation.x = -s * arm;
    this.shR.rotation.x = s * arm;
    this.elL.rotation.x = this.elR.rotation.x = march ? 0 : -(0.15 + run * 0.9) * amt;
    this.torso.rotation.x = -run * 0.18;
    this.root.position.y = 0.95 - run * 0.04 + Math.abs(c) * 0.035 * amt;
    if (amt < 0.05) {
      const breathe = Math.sin(this.phase * 0.5);
      this.torso.scale.set(1, 1 + breathe * 0.008, 1);
      this.shL.rotation.set(breathe * 0.03, 0, 0.06);
      this.shR.rotation.set(-breathe * 0.03, 0, -0.06);
      this.head.rotation.y = Math.sin(this.phase * 0.21) * 0.3;
    } else {
      this.shL.rotation.z = 0.06;
      this.shR.rotation.z = -0.06;
      this.head.rotation.y = 0;
    }
  }
}

export function randomLook(rand: () => number, female: boolean): HumanLook {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  return {
    skin: pick(SKIN_TONES),
    shirt: pick(SHIRTS),
    bottom: female ? pick(SKIRTS) : pick(TROUSERS),
    hair: pick(HAIR),
    female,
    backpack: rand() < 0.45 ? pick(['#1b1b1b', '#263238', '#5d4037', '#1a237e', '#7b1f1f']) : undefined,
    shoes: pick(['#151515', '#3e2723', '#f5f5f5']),
    outfit: 'civil',
  };
}

export function airmanLook(rand: () => number): HumanLook {
  return { skin: SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)], shirt: '', bottom: '', hair: '#120d0a', outfit: 'airman' };
}
