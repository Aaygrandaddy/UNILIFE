import * as THREE from 'three';
import { BUILDINGS, FENCE, HANGAR, PARADE, PARKING, ROUNDABOUT, STADIUM } from './config';
import { ROAD_RECTS } from './world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');

export function clockText(mins: number) {
  const hh = Math.floor(mins / 60) % 24;
  const mm = Math.floor(mins % 60);
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export class Hud {
  private clock = $('hud-clock');
  private day = $('hud-day');
  private money = $('hud-money');
  private alert = $('hud-alert');
  private energy = $('energy-fill');
  private location = $('location-name');
  private missionTitle = $('mission-title');
  private missionText = $('mission-text');
  private missionPanel = $('mission');
  private prompt = $('prompt');
  private speedo = $('speedo');
  private speedValue = $('speed-value');
  private toastEl = $('toast');
  private banner = $('banner');
  private bannerTitle = $('banner-title');
  private bannerText = $('banner-text');
  private fps = $('fps');
  private map = $<HTMLCanvasElement>('minimap');
  private mapCtx = this.map.getContext('2d')!;
  private base: HTMLCanvasElement;
  private toastTimer = 0;
  private bannerTimer = 0;
  private last: Record<string, string> = {};
  private static readonly PX = 2; // base map pixels per metre
  private static readonly HALF = 400; // metres covered by the base map in each direction

  constructor() {
    this.base = this.drawBase();
  }

  private set(key: string, el: HTMLElement, text: string) {
    if (this.last[key] === text) return;
    this.last[key] = text;
    el.textContent = text;
  }

  private drawBase() {
    const S = Hud.HALF * 2 * Hud.PX;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const m = (v: number) => (v + Hud.HALF) * Hud.PX;
    g.fillStyle = '#6f4a32';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#3f5f34';
    g.fillRect(m(-FENCE), m(-FENCE), FENCE * 2 * Hud.PX, FENCE * 2 * Hud.PX);
    g.fillStyle = '#4a4b4e';
    g.fillRect(m(PARADE.x - PARADE.w / 2), m(PARADE.z - PARADE.d / 2), PARADE.w * Hud.PX, PARADE.d * Hud.PX);
    g.fillStyle = '#9d9b95';
    g.fillRect(m(HANGAR.x - HANGAR.w / 2), m(HANGAR.z - HANGAR.d / 2), HANGAR.w * Hud.PX, HANGAR.d * Hud.PX);
    g.fillStyle = '#a4462f';
    g.fillRect(m(STADIUM.x - 48), m(STADIUM.z - 31), 96 * Hud.PX, 62 * Hud.PX);
    g.fillStyle = '#3f7d33';
    g.fillRect(m(STADIUM.x - 34), m(STADIUM.z - 22), 68 * Hud.PX, 44 * Hud.PX);
    g.fillStyle = '#5a5d61';
    for (const r of ROAD_RECTS) g.fillRect(m(r.minX), m(r.minZ), (r.maxX - r.minX) * Hud.PX, (r.maxZ - r.minZ) * Hud.PX);
    for (const p of PARKING) g.fillRect(m(p.x - p.w / 2), m(p.z - p.d / 2), p.w * Hud.PX, p.d * Hud.PX);
    g.beginPath();
    g.arc(m(ROUNDABOUT.x), m(ROUNDABOUT.z), ROUNDABOUT.r * Hud.PX, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3f5f34';
    g.beginPath();
    g.arc(m(0), m(0), ROUNDABOUT.island * Hud.PX, 0, Math.PI * 2);
    g.fill();
    for (const b of BUILDINGS) {
      g.fillStyle = b.kind === 'hostel' ? '#c9a27a' : '#d9d2c2';
      g.fillRect(m(b.x - b.w / 2), m(b.z - b.d / 2), b.w * Hud.PX, b.d * Hud.PX);
    }
    g.strokeStyle = '#e7dcc4';
    g.lineWidth = 2;
    g.strokeRect(m(-FENCE), m(-FENCE), FENCE * 2 * Hud.PX, FENCE * 2 * Hud.PX);
    return c;
  }

  /** Rotating radar, GTA-style: player in the centre, map turns with the camera. */
  drawMap(px: number, pz: number, camYaw: number, heading: number, blips: { x: number; z: number; color: string; label?: string }[]) {
    const ctx = this.mapCtx;
    const W = this.map.width;
    const R = W / 2;
    const zoom = 1.1; // screen px per base px
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(R, R);
    ctx.rotate(camYaw);
    ctx.scale(zoom, zoom);
    ctx.drawImage(this.base, -(px + Hud.HALF) * Hud.PX, -(pz + Hud.HALF) * Hud.PX);
    ctx.restore();

    // blips, clamped to the radar edge
    for (const b of blips) {
      const dx = (b.x - px) * Hud.PX * zoom;
      const dz = (b.z - pz) * Hud.PX * zoom;
      const c = Math.cos(camYaw);
      const s = Math.sin(camYaw);
      let x = dx * c - dz * s;
      let y = dx * s + dz * c;
      const d = Math.hypot(x, y);
      const max = R - 12;
      if (d > max) {
        x = (x / d) * max;
        y = (y / d) * max;
      }
      ctx.fillStyle = b.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(R + x, R + y, b.label ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (b.label) {
        ctx.fillStyle = '#111';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, R + x, R + y + 0.5);
      }
    }

    // player arrow
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(camYaw - heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // north marker
    const nx = R + Math.sin(-camYaw) * -(R - 10);
    const ny = R + Math.cos(-camYaw) * -(R - 10);
    ctx.fillStyle = '#0b0f14';
    ctx.beginPath();
    ctx.arc(nx, ny, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5);

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  status(mins: number, day: number, money: number, alert: number, energy: number) {
    this.set('clock', this.clock, clockText(mins));
    this.set('day', this.day, `${DAYS[day % 7]} · DAY ${day + 1}`);
    this.set('money', this.money, naira(money));
    const shields = '◆'.repeat(alert) + '◇'.repeat(3 - alert);
    if (this.last.alert !== shields) {
      this.last.alert = shields;
      this.alert.textContent = shields;
      this.alert.dataset.level = String(alert);
      this.alert.setAttribute('aria-label', `Provost alert level ${alert} of 3`);
    }
    this.energy.style.transform = `scaleX(${Math.max(0, energy) / 100})`;
  }

  setLocation(name: string) {
    this.set('loc', this.location, name);
  }

  setMission(title: string | null, text: string) {
    this.missionPanel.hidden = !title;
    this.set('mt', this.missionTitle, title ?? '');
    this.set('mx', this.missionText, text);
  }

  /** Today's daily tasks under the objective, ticked when done. */
  setDaily(tasks: { text: string; reward: number; done: boolean }[]) {
    const el = document.getElementById('daily')!;
    const key = JSON.stringify(tasks);
    if (this.last.daily === key) return;
    this.last.daily = key;
    el.hidden = tasks.length === 0;
    el.replaceChildren(
      Object.assign(document.createElement('li'), { className: 'daily-head', textContent: 'Daily tasks' }),
      ...tasks.map((t) => {
        const li = document.createElement('li');
        li.className = t.done ? 'is-done' : '';
        li.textContent = `${t.done ? '✓' : '○'} ${t.text}`;
        const r = document.createElement('span');
        r.textContent = naira(t.reward);
        li.append(r);
        return li;
      }),
    );
  }

  setPrompt(text: string) {
    this.prompt.hidden = !text;
    this.set('prompt', this.prompt, text);
  }

  setSpeed(kmh: number | null) {
    this.speedo.hidden = kmh === null;
    if (kmh !== null) this.set('speed', this.speedValue, String(Math.round(Math.abs(kmh))));
  }

  setFps(f: number) {
    this.set('fps', this.fps, `${f} FPS`);
  }

  toast(text: string, ms = 3200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-visible'), ms);
  }

  showBanner(title: string, text: string, ms = 4200) {
    this.bannerTitle.textContent = title;
    this.bannerText.textContent = text;
    this.banner.classList.add('is-visible');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('is-visible'), ms);
  }
}

export type Blip = { x: number; z: number; color: string; label?: string };
export const toBlip = (v: THREE.Vector3, color: string, label?: string): Blip => ({ x: v.x, z: v.z, color, label });
