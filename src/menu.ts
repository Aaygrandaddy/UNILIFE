/** Pause menu: resume, how to play, settings, legal pages. Settings persist in this browser. */

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  sensitivity: number; // 0.4 – 2
  invertY: boolean;
  radioVolume: number; // 0 – 1
  showFps: boolean;
  sfxVolume: number; // 0 – 1
  ambience: boolean;
}

const KEY = 'forcelife.settings.v1';
const DEFAULTS: Settings = { quality: 'medium', sensitivity: 1, invertY: false, radioVolume: 0.6, showFps: false, sfxVolume: 0.8, ambience: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // storage blocked: defaults
  }
  // phones and small screens start on low
  return { ...DEFAULTS, quality: matchMedia('(pointer: coarse)').matches ? 'low' : 'medium' };
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not saved; still applies this session
  }
}

type Tab = 'resume' | 'help' | 'settings' | 'terms' | 'privacy';

export class Menu {
  open = false;
  settings = loadSettings();
  onSettings?: (s: Settings) => void;
  private root = document.getElementById('menu')!;
  private body = document.getElementById('menu-body')!;
  private tab: Tab = 'help';

  constructor() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = b.dataset.tab as Tab;
        if (t === 'resume') this.toggle(false);
        else this.show(t);
      }),
    );
    document.getElementById('menu-button')!.addEventListener('click', () => this.toggle(true));
    // while paused the game loop is stopped, so the menu closes itself
    addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (!this.open || (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      if (e.code === 'Escape' || e.code === 'KeyM') this.toggle(false);
    });
  }

  toggle(force?: boolean, tab: Tab = this.tab) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.show(tab === 'resume' ? 'help' : tab);
    }
  }

  show(tab: Tab) {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    this.body.replaceChildren();
    if (tab === 'help') this.help();
    else if (tab === 'settings') this.settingsView();
    else if (tab === 'terms' || tab === 'privacy') this.legal(tab);
  }

  private help() {
    this.body.innerHTML = `
      <h2>How to play</h2>
      <p>You are a new student at Force Life Institute of Technology, Kaduna. Follow the yellow beam and the objective panel to get through your first day: clear the gate, register, move into Hostel B, attend lectures, and be home before curfew.</p>
      <table>
        <tr><th scope="row">Move / drive</th><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows · touch D-pad</td></tr>
        <tr><th scope="row">Run</th><td><kbd>Shift</kbd> · RUN (uses energy; eat at the Cafeteria)</td></tr>
        <tr><th scope="row">Look</th><td>Drag, or double-click to lock the mouse (<kbd>Esc</kbd> releases)</td></tr>
        <tr><th scope="row">Interact / enter buildings</th><td><kbd>E</kbd> · ACT</td></tr>
        <tr><th scope="row">Get in or out of a vehicle</th><td><kbd>F</kbd> · CAR</td></tr>
        <tr><th scope="row">Horn</th><td><kbd>Q</kbd> · HORN (while driving)</td></tr>
        <tr><th scope="row">Phone</th><td><kbd>P</kbd> · 📱 (chat, snaps, photos, posts, Waka rides)</td></tr>
        <tr><th scope="row">Ride camera</th><td><kbd>C</kbd> while riding</td></tr>
        <tr><th scope="row">Menu</th><td><kbd>M</kbd> · ⚙</td></tr>
      </table>
      <h3>Base rules</h3>
      <ul>
        <li>Speed limit on base is 40 km/h.</li>
        <li>At 6:00 PM the bugle sounds for Retreat: stand still until the flag is down.</li>
        <li>Curfew is 10:00 PM. Be back at Hostel B.</li>
        <li>Break the rules and the Provost fines you. Three strikes and you are escorted back to your hall.</li>
      </ul>
      <p class="muted">Force Life is set on a fictional campus. It is not affiliated with any real institution or with the Nigerian Air Force.</p>`;
  }

  private settingsView() {
    const s = this.settings;
    const f = document.createElement('form');
    f.className = 'settings';
    f.innerHTML = `
      <h2>Settings</h2>
      <fieldset><legend>Graphics quality</legend>
        ${(['low', 'medium', 'high'] as Quality[]).map((q) => `<label><input type="radio" name="quality" value="${q}" ${s.quality === q ? 'checked' : ''}/> ${q[0].toUpperCase() + q.slice(1)}</label>`).join('')}
        <p class="muted">Low turns off shadows and lowers resolution: best for budget phones.</p>
      </fieldset>
      <label for="set-sens">Look sensitivity <output id="set-sens-out">${s.sensitivity.toFixed(1)}×</output></label>
      <input id="set-sens" type="range" min="0.4" max="2" step="0.1" value="${s.sensitivity}" />
      <label class="check"><input id="set-invert" type="checkbox" ${s.invertY ? 'checked' : ''}/> Invert vertical look</label>
      <label for="set-sfx">Sound effects volume <output id="set-sfx-out">${Math.round(s.sfxVolume * 100)}%</output></label>
      <input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfxVolume}" />
      <label class="check"><input id="set-amb" type="checkbox" ${s.ambience ? 'checked' : ''}/> Background sounds (birds, crickets, wind)</label>
      <label for="set-vol">Radio volume <output id="set-vol-out">${Math.round(s.radioVolume * 100)}%</output></label>
      <input id="set-vol" type="range" min="0" max="1" step="0.05" value="${s.radioVolume}" />
      <label class="check"><input id="set-fps" type="checkbox" ${s.showFps ? 'checked' : ''}/> Show frame rate</label>`;
    f.addEventListener('input', () => {
      const q = (f.querySelector('input[name=quality]:checked') as HTMLInputElement).value as Quality;
      const sens = Number((f.querySelector('#set-sens') as HTMLInputElement).value);
      const vol = Number((f.querySelector('#set-vol') as HTMLInputElement).value);
      this.settings = {
        quality: q,
        sensitivity: sens,
        invertY: (f.querySelector('#set-invert') as HTMLInputElement).checked,
        radioVolume: vol,
        showFps: (f.querySelector('#set-fps') as HTMLInputElement).checked,
        sfxVolume: Number((f.querySelector('#set-sfx') as HTMLInputElement).value),
        ambience: (f.querySelector('#set-amb') as HTMLInputElement).checked,
      };
      (f.querySelector('#set-sfx-out') as HTMLOutputElement).textContent = `${Math.round(this.settings.sfxVolume * 100)}%`;
      (f.querySelector('#set-sens-out') as HTMLOutputElement).textContent = `${sens.toFixed(1)}×`;
      (f.querySelector('#set-vol-out') as HTMLOutputElement).textContent = `${Math.round(vol * 100)}%`;
      saveSettings(this.settings);
      this.onSettings?.(this.settings);
    });
    f.addEventListener('submit', (e) => e.preventDefault());
    this.body.append(f);
  }

  private async legal(page: 'terms' | 'privacy') {
    this.body.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const html = await (await fetch(`./legal/${page}.html`)).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const main = doc.querySelector('main');
      this.body.replaceChildren(...(main ? Array.from(main.childNodes) : []));
      const link = document.createElement('a');
      link.href = `./legal/${page}.html`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open as a separate page';
      this.body.append(link);
    } catch {
      this.body.innerHTML = '<p>Could not load this page. Check your connection and try again.</p>';
    }
  }
}
