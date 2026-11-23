// Films the Force Life launch trailer frame by frame.
// usage: node film.cjs <wide|vertical> <outDir> [onlyScene]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FPS = 24;
const FORMAT = process.argv[2] || 'wide';
const OUT = process.argv[3];
const ONLY = process.argv[4] || null;
const VIEW = FORMAT === 'wide' ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
const URL = process.env.FILM_URL || 'http://localhost:4196/?debug';

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const PI = Math.PI;

// Scene list: duration in seconds. Captions and sound cues are added later from timeline.json.
const SCENES = [
  { id: 'title', dur: 3.5 },
  { id: 'gate', dur: 4.5 },
  { id: 'drive', dur: 5.5 },
  { id: 'waka', dur: 6 },
  { id: 'phone', dur: 7 },
  { id: 'inside', dur: 6 },
  { id: 'provost', dur: 4.5 },
  { id: 'retreat', dur: 6.5 },
  { id: 'night', dur: 5 },
  { id: 'end', dur: 5 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('forcelife.settings.v1', JSON.stringify({ quality: 'high', sensitivity: 1, invertY: false, radioVolume: 0.6, showFps: false, sfxVolume: 0.8, ambience: true }));
    } catch {}
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('#loading-screen', { state: 'detached', timeout: 180000 });
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const wait = (ms) => p.waitForTimeout(ms);

  // a signed-in (on-device) player so the phone has a home screen
  await p.waitForSelector('#ph-email', { timeout: 60000 });
  await p.click('text=New here? Create an account');
  await p.fill('#ph-email', 'tobi@forcelife.demo');
  await p.fill('#ph-pass', 'demo-pass-1');
  await p.fill('#ph-user', 'tobi_aero');
  await p.fill('#ph-name', 'Tobi A.');
  await p.fill('#ph-dob', '2003-05-14');
  await p.check('#ph-agree');
  await p.click('button:has-text("Create account")');
  await p.waitForSelector('.app-icon', { timeout: 60000 });
  await ev(() => uni.phone(false));
  await p.keyboard.press('KeyH');
  await ev(() => { uni.film(true); if (uni.markers) uni.markers(false); });
  await wait(500);

  let frameNo = 0;
  const timeline = [];
  let tNow = 0;
  const snap = async () => {
    await ev(() => uni.step(1, 1 / 24));
    const file = path.join(OUT, `f${String(frameNo).padStart(5, '0')}.jpg`);
    await p.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: 180000 });
    frameNo++;
  };
  const pre = (n) => ev((k) => uni.step(k, 1 / 24), n); // advance without capturing

  const scenes = {
    async title(n) {
      await ev(() => {
        uni.hudMode('clean');
        uni.state.minutes = 7 * 60 + 5;
        uni.teleport(-9, 300, 0);
      });
      await pre(10);
      for (let i = 0; i < n; i++) {
        const t = ease(i / (n - 1));
        await ev(([pp, tt]) => uni.cam(pp, tt), [lerp([0, 4, 312], [0, 21, 266], t), lerp([0, 9, 205], [0, 6, 170], t)]);
        await snap();
      }
      await ev(() => uni.cam(null));
    },
    async gate(n) {
      await ev(() => {
        uni.hudMode('play');
        uni.teleport(-9, 268, 0);
        uni.look(0.08, 0.16);
        uni.hold('KeyW', true);
      });
      await pre(12);
      for (let i = 0; i < n; i++) await snap();
      await ev(() => uni.hold('KeyW', false));
    },
    async drive(n) {
      await ev(() => {
        uni.hudMode('play');
        uni.teleport(9, 222, 0);
        uni.drive(0);
        const v = uni.vehicles[0];
        v.pos.set(3, 0, 214);
        v.yaw = 0;
        v.speed = 13;
        uni.look(0, 0.12);
        uni.hold('KeyW', true);
      });
      await pre(6);
      for (let i = 0; i < n; i++) await snap();
      await ev(() => uni.hold('KeyW', false));
    },
    async waka(n) {
      await ev(() => {
        uni.hudMode('play');
        uni.state.minutes = 9 * 60 + 40;
        uni.teleport(9, 150, Math.PI);
        uni.book('keke', 'library');
        uni.board();
        uni.rideCam('cinematic');
      });
      await pre(30);
      for (let i = 0; i < n; i++) {
        if (i === Math.floor(n * 0.55)) await ev(() => uni.rideCam('chase'));
        await snap();
      }
    },
    async phone(n) {
      await ev(() => {
        uni.hudMode('play');
        uni.state.minutes = 12 * 60 + 15;
        uni.teleport(14, 40, 0.35);
        uni.look(0.35, 0.12);
        uni.phone(true);
      });
      await wait(600);
      const at = (k) => Math.floor(n * k);
      for (let i = 0; i < n; i++) {
        if (i === at(0.12)) {
          await p.click('.app-icon:has-text("Gist")');
          await p.click('[role=tab]:has-text("People")');
          await p.click('.row:has-text("Tunde")');
        }
        if (i === at(0.2)) {
          await p.fill('#ph-msg', 'Guy, I don reach Senate. Where you dey?');
          await p.press('#ph-msg', 'Enter');
          await p.evaluate(() => document.activeElement && document.activeElement.blur());
        }
        if (i === at(0.52)) {
          await p.click('#phone-home');
          await p.click('.app-icon:has-text("Yarn")');
        }
        if (i === at(0.58)) {
          await p.fill('#ph-yarn', 'Resumption day at Force Life 🔥 Who dey for Hostel B?');
          await p.click('button:has-text("Post")');
        }
        if (i === at(0.78)) {
          await p.click('#phone-home');
          await p.click('.app-icon:has-text("Waka")');
          if (await p.$('#ph-dest')) await p.selectOption('#ph-dest', 'cafeteria');
        }
        await snap();
      }
      await ev(() => uni.phone(false));
      await wait(500);
    },
    async inside(n) {
      await ev(() => {
        uni.hudMode('clean');
        uni.teleport(-88, -46, 0);
        uni.enter('theatre');
      });
      await wait(900);
      await pre(3);
      const half = Math.floor(n / 2);
      for (let i = 0; i < half; i++) {
        const t = ease(i / (half - 1));
        await ev(([pp, tt]) => uni.cam(pp, tt), [lerp([3111, 3.6, 8.5], [3125, 2.6, 5.5], t), [3120, 1.3, -8]]);
        await snap();
      }
      await ev(() => {
        uni.cam(null);
        uni.leave();
      });
      await wait(900);
      await ev(() => {
        uni.teleport(83, 42, 0);
        uni.enter('cafeteria');
      });
      await wait(900);
      await pre(3);
      for (let i = half; i < n; i++) {
        const t = ease((i - half) / (n - half - 1));
        await ev(([pp, tt]) => uni.cam(pp, tt), [lerp([3247.5, 2.7, 5.8], [3235, 2.2, 4.6], t), [3240, 1.1, -3.5]]);
        await snap();
      }
      await ev(() => {
        uni.cam(null);
        uni.leave();
      });
      await wait(900);
    },
    async provost(n) {
      await ev(() => {
        uni.hudMode('play');
        uni.state.minutes = 16 * 60 + 40;
        uni.teleport(-120, -128, -Math.PI / 2);
        uni.drive(0);
        const v = uni.vehicles[0];
        v.pos.set(-118, 0, -137);
        v.yaw = -Math.PI / 2;
        v.speed = 19;
        uni.look(-Math.PI / 2, 0.12);
        uni.hold('KeyW', true);
      });
      await pre(4);
      for (let i = 0; i < n; i++) await snap();
      await ev(() => uni.hold('KeyW', false));
    },
    async retreat(n) {
      await ev(() => {
        uni.hudMode('clean');
        uni.teleport(-176, 126, Math.PI);
        uni.state.minutes = 17 * 60 + 59.4;
        uni.timeScale(3);
      });
      await pre(2);
      for (let i = 0; i < n; i++) {
        const t = ease(i / (n - 1));
        // close on the flagpole (x -180, z 129): follow the flag down as Retreat begins, the saluting base behind
        const flagY = 12.5 - 9 * Math.max(0, (i - n * 0.08) / (n * 0.92));
        await ev(([pp, tt]) => uni.cam(pp, tt), [lerp([-168, 9.5, 141], [-171, 5.5, 139], t), [-180.5, flagY, 129]]);
        await snap();
      }
      await ev(() => uni.timeScale(1));
    },
    async night(n) {
      await ev(() => {
        uni.hudMode('clean');
        uni.teleport(-176, 30, 0);
        uni.state.minutes = 18 * 60 + 25;
        uni.timeScale(32);
      });
      for (let i = 0; i < n; i++) {
        const a = 0.95 - 0.45 * (i / (n - 1));
        const R = 160;
        await ev(([pp, tt]) => uni.cam(pp, tt), [[Math.sin(a) * R, 58, -30 + Math.cos(a) * R], [0, 6, -45]]);
        await snap();
      }
    },
    async end(n) {
      await ev(() => uni.timeScale(6));
      for (let i = 0; i < n; i++) {
        const a = 0.5 - 0.25 * (i / (n - 1));
        const R = 160 - 30 * ease(i / (n - 1));
        await ev(([pp, tt]) => uni.cam(pp, tt), [[Math.sin(a) * R, 58 - 12 * (i / (n - 1)), -30 + Math.cos(a) * R], [0, 10, -55]]);
        await snap();
      }
      await ev(() => uni.timeScale(1));
    },
  };

  // ONLY: one scene id, or "from:<id>" to film that scene and everything after it (resume)
  const fromIdx = ONLY && ONLY.startsWith('from:') ? SCENES.findIndex((x) => x.id === ONLY.slice(5)) : -1;
  for (const [idx, s] of SCENES.entries()) {
    const n = Math.round(s.dur * FPS);
    const want = !ONLY || ONLY === s.id || (fromIdx >= 0 && idx >= fromIdx);
    if (!want) frameNo += n; // keep frame numbers aligned with the full timeline
    const start = want ? frameNo : frameNo - n;
    if (want) {
      const t0 = Date.now();
      await scenes[s.id](n);
      console.log(`${s.id}: ${n} frames in ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    timeline.push({ id: s.id, start: tNow, dur: s.dur, firstFrame: start });
    tNow += s.dur;
  }
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ fps: FPS, format: FORMAT, total: tNow, scenes: timeline }, null, 2));
  console.log('done', frameNo, 'frames');
  await b.close();
})();
