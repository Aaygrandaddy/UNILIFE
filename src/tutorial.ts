/** First-time coach: teaches the controls by having the player do each one. Shown once per device. */

export interface TutorialSignals {
  moved: number; // metres walked this frame
  looked: number; // pixels of look input this frame
  running: boolean;
  phoneOpen: boolean;
  phoneApp: string;
}

const KEY = 'forcelife.tutorial.v1';
const touch = () => matchMedia('(pointer: coarse)').matches;

const STEPS: { text: () => string; done: (s: Progress) => boolean }[] = [
  { text: () => (touch() ? 'Walk with the arrow pad.' : 'Walk with W A S D or the arrow keys.'), done: (p) => p.moved > 4 },
  { text: () => (touch() ? 'Drag on the screen to look around.' : 'Drag with the mouse to look around (double-click locks it).'), done: (p) => p.looked > 250 || p.t > 9 },
  { text: () => (touch() ? 'Hold RUN while you move to run.' : 'Hold Shift while you move to run.'), done: (p) => p.ran > 1.5 },
  { text: () => 'Follow the yellow beam. Your objective is in the panel at the top left.', done: (p) => p.t > 6 },
  { text: () => (touch() ? 'Tap 📱 to open your phone.' : 'Press P (or click 📱) to open your phone.'), done: (p) => p.phone },
  { text: () => 'Open the Style app to make your look.', done: (p) => p.style || p.t > 14 },
];

interface Progress {
  t: number;
  moved: number;
  looked: number;
  ran: number;
  phone: boolean;
  style: boolean;
}

export class Tutorial {
  active = false;
  private i = 0;
  private p: Progress = { t: 0, moved: 0, looked: 0, ran: 0, phone: false, style: false };
  private el = document.getElementById('coach')!;
  private textEl = document.getElementById('coach-text')!;
  private stepEl = document.getElementById('coach-step')!;

  constructor(private onFinish: () => void) {
    document.getElementById('coach-skip')!.addEventListener('click', () => this.finish());
  }

  /** Starts the tutorial unless this device has finished it before. */
  start() {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      // storage blocked: show it anyway
    }
    this.active = true;
    this.el.hidden = false;
    this.show();
  }

  update(dt: number, s: TutorialSignals) {
    if (!this.active) return;
    const p = this.p;
    p.t += dt;
    p.moved += s.moved;
    p.looked += s.looked;
    if (s.running) p.ran += dt;
    p.phone ||= s.phoneOpen;
    p.style ||= s.phoneApp === 'style';
    if (STEPS[this.i].done(p)) {
      this.i++;
      this.p = { t: 0, moved: 0, looked: 0, ran: 0, phone: p.phone, style: false };
      if (this.i >= STEPS.length) this.finish();
      else this.show();
    }
  }

  private show() {
    this.textEl.textContent = STEPS[this.i].text();
    this.stepEl.textContent = `${this.i + 1} / ${STEPS.length}`;
  }

  private finish() {
    this.active = false;
    this.el.hidden = true;
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // fine: it will show again next time
    }
    this.onFinish();
  }
}
