import * as THREE from 'three';
import type { VKind } from './config';
import { Radio, STATIONS } from './music';
import { RoadGraph } from './roadgraph';
import { Vehicle, laneRoute } from './vehicles';

export type Tier = 'keke' | 'car' | 'luxury';

export const TIERS: Record<Tier, { label: string; blurb: string; kind: VKind; color: string; base: number; perKm: number; cruise: number; seats: string }> = {
  keke: { label: 'Keke', blurb: 'Cheapest. Breezy.', kind: 'keke', color: '#f2c200', base: 2, perKm: 1, cruise: 9, seats: '3 seats' },
  car: { label: 'Car', blurb: 'Air-conditioned saloon.', kind: 'car', color: '#c4c8cc', base: 4, perKm: 2, cruise: 13, seats: '4 seats' },
  luxury: { label: 'Luxury', blurb: 'Black SUV, leather seats.', kind: 'suv', color: '#0d0e10', base: 10, perKm: 4, cruise: 15, seats: '4 seats' },
};

export const TOKEN_PRICE_NAIRA = 100;
const DRIVERS = ['Musa', 'Chinedu', 'Ibrahim', 'Blessing', 'Yusuf', 'Femi', 'Hauwa', 'Peter'];
export type CamMode = 'chase' | 'side' | 'overhead' | 'cinematic';
const CAM_MODES: CamMode[] = ['chase', 'side', 'overhead', 'cinematic'];

export interface Place {
  id: string;
  name: string;
  pos: THREE.Vector3;
}

type Phase = 'idle' | 'coming' | 'waiting' | 'riding' | 'leaving';

/**
 * Waka Rides: book a keke, car or luxury SUV. A driver routes to you on the road network,
 * you get in with F, then ride to the destination with the radio and a choice of cameras.
 */
export class Rides {
  phase: Phase = 'idle';
  tier: Tier = 'keke';
  fare = 0;
  driver = '';
  dest: Place | null = null;
  vehicle: Vehicle | null = null;
  camMode: CamMode = 'chase';
  radio = new Radio();
  onChange?: () => void;
  private graph = new RoadGraph();
  private orbit = 0;
  private panel = document.getElementById('ride-panel')!;

  constructor(
    private scene: THREE.Scene,
    private vehicles: Vehicle[],
    private toast: (t: string) => void,
  ) {
    this.radio.onChange = () => this.renderPanel();
    this.bindPanel();
  }

  quote(from: THREE.Vector3, to: THREE.Vector3, tier: Tier) {
    const km = this.graph.length(this.graph.route(from, to)) / 1000;
    const t = TIERS[tier];
    return { km, tokens: Math.ceil(t.base + t.perKm * km * 4), minutes: Math.max(1, Math.round((km * 1000) / t.cruise / 60 * 1.3)) };
  }

  get active() {
    return this.phase !== 'idle';
  }

  get riding() {
    return this.phase === 'riding';
  }

  book(tier: Tier, dest: Place, player: THREE.Vector3, fare: number) {
    if (this.phase !== 'idle') return;
    this.tier = tier;
    this.dest = dest;
    this.fare = fare;
    this.driver = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
    const t = TIERS[tier];
    // start the driver on the road network, roughly 120–260 m away
    const start = this.spawnPoint(player);
    const v = new Vehicle(t.kind, t.color, `Waka ${t.label}`);
    const route = laneRoute(this.graph.route(start, player), 3, false);
    v.pos.set(route[0].x, 0, route[0].y);
    const n = route[1] ?? route[0];
    v.yaw = Math.atan2(-(n.x - route[0].x), -(n.y - route[0].y));
    v.ai = { pts: route, idx: Math.min(1, route.length - 1), loop: false, cruise: t.cruise + 2, stopAtEnd: true };
    v.syncTransform();
    this.scene.add(v.group);
    this.vehicles.push(v);
    this.vehicle = v;
    this.phase = 'coming';
    this.toast(`${this.driver} is coming in a ${t.label.toLowerCase()}. Watch for the car on your radar.`);
    this.onChange?.();
  }

  /** Cancel before boarding. Returns the tokens to refund. */
  cancel(): number {
    if (this.phase !== 'coming' && this.phase !== 'waiting') return 0;
    const refund = this.fare;
    this.despawn();
    this.toast('Ride cancelled. Tokens refunded.');
    return refund;
  }

  canBoard(p: THREE.Vector3) {
    return this.phase === 'waiting' && !!this.vehicle && this.vehicle.pos.distanceTo(p) < 15;
  }

  board() {
    const v = this.vehicle!;
    const route = laneRoute(this.graph.route(v.pos, this.dest!.pos), 3, false);
    v.ai = { pts: route, idx: Math.min(1, route.length - 1), loop: false, cruise: TIERS[this.tier].cruise, stopAtEnd: true };
    this.phase = 'riding';
    this.camMode = 'chase';
    this.radio.play();
    this.panel.hidden = false;
    this.renderPanel();
    this.toast(`Heading to ${this.dest!.name}. C changes the camera; the radio controls are on screen.`);
    this.onChange?.();
  }

  /** Called every frame. Returns a drop-off point when the ride ends. */
  update(dt: number): THREE.Vector3 | null {
    const v = this.vehicle;
    if (!v?.ai) return null;
    if (this.phase === 'coming' && v.ai.arrived) {
      this.phase = 'waiting';
      this.toast(`Your ${TIERS[this.tier].label.toLowerCase()} has arrived (purple W on your radar). Walk up to it and press F, or tap CAR.`);
      this.onChange?.();
    }
    if (this.phase === 'riding' && v.ai.arrived && Math.abs(v.speed) < 0.3) {
      // drop off on the kerb side (right)
      const right = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      const drop = v.pos.clone().addScaledVector(right, v.spec.radius + 0.9);
      this.radio.stop();
      this.panel.hidden = true;
      this.toast(`Arrived at ${this.dest!.name}. Thanks for riding with ${this.driver}!`);
      this.driveAway();
      return drop;
    }
    if (this.phase === 'leaving' && v.ai.arrived) this.despawn();
    return null;
  }

  private driveAway() {
    const v = this.vehicle!;
    const far = this.graph.nodes[Math.floor(Math.random() * this.graph.nodes.length)];
    const route = laneRoute(this.graph.route(v.pos, new THREE.Vector3(far.x, 0, far.z)), 3, false);
    v.ai = { pts: route, idx: Math.min(1, route.length - 1), loop: false, cruise: TIERS[this.tier].cruise, stopAtEnd: true };
    this.phase = 'leaving';
    this.onChange?.();
  }

  private despawn() {
    if (this.vehicle) {
      this.scene.remove(this.vehicle.group);
      const i = this.vehicles.indexOf(this.vehicle);
      if (i >= 0) this.vehicles.splice(i, 1);
    }
    this.vehicle = null;
    this.phase = 'idle';
    this.radio.stop();
    this.panel.hidden = true;
    this.onChange?.();
  }

  private spawnPoint(p: THREE.Vector3) {
    const nodes = this.graph.nodes.filter((n) => Math.abs(n.x) < 250 && n.z < 320 && n.z > -250);
    const scored = nodes.map((n) => ({ n, d: Math.hypot(n.x - p.x, n.z - p.z) })).sort((a, b) => a.d - b.d);
    const good = scored.filter((s) => s.d > 120 && s.d < 260);
    const pick = good.length ? good[Math.floor(Math.random() * good.length)].n : scored[scored.length - 1].n;
    return new THREE.Vector3(pick.x, 0, pick.z);
  }

  cycleCamera() {
    this.camMode = CAM_MODES[(CAM_MODES.indexOf(this.camMode) + 1) % CAM_MODES.length];
    this.renderPanel();
  }

  /** Cinematic follow camera while riding. */
  updateCamera(cam: THREE.PerspectiveCamera, dt: number) {
    const v = this.vehicle!;
    const f = v.forward();
    const right = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const look = v.pos.clone().setY(1.2);
    const want = new THREE.Vector3();
    switch (this.camMode) {
      case 'chase':
        want.copy(v.pos).addScaledVector(f, -v.spec.camDist).setY(v.spec.camHeight + 1.3);
        look.addScaledVector(f, 6);
        break;
      case 'side':
        want.copy(v.pos).addScaledVector(right, 6.5).addScaledVector(f, 1.5).setY(1.6);
        break;
      case 'overhead':
        want.copy(v.pos).addScaledVector(f, -6).setY(28);
        break;
      case 'cinematic':
        this.orbit += dt * 0.25;
        want.set(v.pos.x + Math.sin(this.orbit) * 11, 3.2 + Math.sin(this.orbit * 0.7) * 1.5, v.pos.z + Math.cos(this.orbit) * 11);
        break;
    }
    cam.position.lerp(want, 1 - Math.exp(-(this.camMode === 'cinematic' ? 3 : 6) * dt));
    cam.lookAt(look);
  }

  // ---------- on-screen ride panel (radio + camera) ----------
  private bindPanel() {
    const q = (id: string) => this.panel.querySelector<HTMLElement>(`[data-ride="${id}"]`)!;
    q('prev').addEventListener('click', () => this.radio.setStation(this.radio.station - 1));
    q('next').addEventListener('click', () => this.radio.setStation(this.radio.station + 1));
    q('play').addEventListener('click', () => this.radio.toggle());
    q('skip').addEventListener('click', () => this.radio.skip());
    q('cam').addEventListener('click', () => this.cycleCamera());
    q('volume').addEventListener('input', (e) => this.radio.setVolume(Number((e.target as HTMLInputElement).value) / 100));
  }

  renderPanel() {
    const q = (id: string) => this.panel.querySelector<HTMLElement>(`[data-ride="${id}"]`)!;
    q('station').textContent = this.radio.playing ? STATIONS[this.radio.station].name : 'Radio off';
    q('track').textContent = this.radio.playing ? `${this.radio.track.title} · ${this.radio.track.artist}` : 'Press ▶ to play';
    q('play').textContent = this.radio.playing ? '❚❚' : '▶';
    q('play').setAttribute('aria-label', this.radio.playing ? 'Pause radio' : 'Play radio');
    q('cam').textContent = `Camera: ${this.camMode}`;
    q('trip').textContent = this.dest ? `${TIERS[this.tier].label} with ${this.driver} → ${this.dest.name}` : '';
  }
}
