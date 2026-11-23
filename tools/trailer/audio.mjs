// Synthesises the Force Life trailer soundtrack (music + sound effects) to a 16-bit stereo WAV.
// Everything is generated here: no samples or licensed music.
// usage: node audio.mjs timeline.json out.wav
import { readFileSync, writeFileSync } from 'node:fs';

const tl = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const SR = 44100;
const TOTAL = tl.total + 0.6;
const N = Math.ceil(TOTAL * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const at = (id) => tl.scenes.find((s) => s.id === id);

// ---------- deterministic randomness ----------
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = () => rnd() * 2 - 1;

// ---------- building blocks ----------
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
function add(i, v, pan = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * Math.min(1, 1 - pan);
  R[i] += v * Math.min(1, 1 + pan);
}
function env(t, a, d, len) {
  if (t < 0 || t > len) return 0;
  if (t < a) return t / a;
  return Math.max(0, 1 - (t - a) / Math.max(1e-4, len - a)) ** d;
}
const osc = {
  sine: (ph) => Math.sin(2 * Math.PI * ph),
  saw: (ph) => 2 * (ph - Math.floor(ph + 0.5)),
  square: (ph) => (ph % 1 < 0.5 ? 1 : -1),
  tri: (ph) => 1 - 4 * Math.abs((ph % 1) - 0.5),
};
/** One voice. freq may be a function of time. lp is a one-pole low-pass cutoff in Hz. */
function tone(t0, len, freq, { type = 'sine', amp = 0.3, a = 0.005, d = 1.5, pan = 0, lp = 0, vib = 0 } = {}) {
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  let ph = 0;
  let y = 0;
  const k = lp ? 1 - Math.exp((-2 * Math.PI * lp) / SR) : 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = (typeof freq === 'function' ? freq(t) : freq) * (1 + vib * Math.sin(2 * Math.PI * 5.2 * t));
    ph += f / SR;
    let v = osc[type](ph) * env(t, a, d, len) * amp;
    y += k * (v - y);
    add(s0 + i, lp ? y : v, pan);
  }
}
/** Filtered noise burst: an RBJ band-pass biquad (always stable), optionally sweeping. */
function hiss(t0, len, { f = 2000, q = 1, amp = 0.2, a = 0.002, d = 2, pan = 0, sweepTo = 0 } = {}) {
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b2 = 0, a1 = 0, a2 = 0;
  const coef = (fc) => {
    const w = (2 * Math.PI * Math.min(fc, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * Math.max(0.3, q));
    const a0 = 1 + alpha;
    b0 = alpha / a0;
    b2 = -alpha / a0;
    a1 = (-2 * Math.cos(w)) / a0;
    a2 = (1 - alpha) / a0;
  };
  coef(f);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (sweepTo && i % 32 === 0) coef(f * (sweepTo / f) ** (t / len));
    const x = noise();
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    add(s0 + i, y * env(t, a, d, len) * amp * 1.6, pan);
  }
}

// ---------- music ----------
const BPM = 110;
const beat = 60 / BPM;
const step16 = beat / 4;
const A = 45; // A2
const prog = [0, -4, -7, -2]; // Am  F  D(m)  G  (as semitone offsets from A)
const minorChord = (r) => [r, r + 3, r + 7];
const majorChord = (r) => [r, r + 4, r + 7];
const chords = [minorChord(A + 12), majorChord(A + 8), minorChord(A + 5), majorChord(A + 10)];
const melody = [76, null, 74, 72, null, 69, 72, null, 74, null, 76, 79, null, 76, 74, null];

function kick(t, amp = 0.9) {
  tone(t, 0.32, (x) => 45 + 110 * Math.exp(-x * 28), { amp, a: 0.001, d: 2.2 });
}
function clap(t, amp = 0.35) {
  for (const o of [0, 0.011, 0.022]) hiss(t + o, 0.16, { f: 1400, q: 0.9, amp: amp / 2, d: 3 });
}
function shaker(t, amp) {
  hiss(t, 0.06, { f: 8000, q: 0.7, amp, d: 3, pan: 0.25 });
}
function logDrum(t, m, len) {
  tone(t, len, (x) => midi(m) * (1 + 0.5 * Math.exp(-x * 40)), { amp: 0.42, a: 0.002, d: 1.6 });
}

/** Lay down the groove from t0 to t1. level scales everything; lp darkens it. */
function groove(t0, t1, { level = 1, full = true, lp = 0 } = {}) {
  const bars = Math.ceil((t1 - t0) / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const bar0 = t0 + b * beat * 4;
    const ci = b % 4;
    for (let s = 0; s < 16; s++) {
      const t = bar0 + s * step16 + (s % 2 ? step16 * 0.12 : 0); // a little swing
      if (t >= t1) break;
      if ([0, 7, 10].includes(s)) kick(t, 0.85 * level);
      if ([4, 12].includes(s)) clap(t, 0.3 * level);
      if (s % 2 === 0) shaker(t, (s % 4 === 2 ? 0.12 : 0.06) * level);
      if ([0, 3, 6, 10, 13].includes(s)) logDrum(t, A - 12 + prog[ci] + (s === 13 ? 7 : 0), step16 * 1.8);
      if (full && [2, 6, 10, 14].includes(s)) {
        for (const m of chords[ci]) tone(t, step16 * 1.3, midi(m), { type: 'saw', amp: 0.035 * level, lp: lp || 1800, d: 2 });
      }
      const mel = melody[s];
      if (full && mel && b % 2 === 1) tone(t, step16 * 1.7, midi(mel), { type: 'tri', amp: 0.09 * level, d: 1.4, pan: -0.2, lp: lp || 0 });
    }
  }
}

// ---------- sound effects (modelled on the game's own) ----------
function whoosh(t) {
  hiss(t - 0.28, 0.42, { f: 400, sweepTo: 5000, q: 1.5, amp: 0.35, a: 0.25, d: 1.5 });
}
function impact(t, amp = 1) {
  tone(t, 1.4, (x) => 38 + 70 * Math.exp(-x * 9), { amp: 0.9 * amp, a: 0.001, d: 2 });
  hiss(t, 0.9, { f: 700, q: 0.6, amp: 0.45 * amp, d: 3 });
  hiss(t, 0.25, { f: 6000, q: 0.5, amp: 0.25 * amp, d: 2 });
}
function riser(t0, len) {
  hiss(t0, len, { f: 300, sweepTo: 9000, q: 3, amp: 0.25, a: len * 0.95, d: 0.5 });
  tone(t0, len, (x) => 110 * 2 ** ((x / len) * 2), { type: 'saw', amp: 0.05, a: len * 0.9, d: 0.5, lp: 2500 });
}
function footsteps(t0, t1, every, amp = 0.18) {
  for (let t = t0; t < t1; t += every) {
    hiss(t, 0.07, { f: 900 + rnd() * 300, q: 1.2, amp, d: 3 });
    tone(t, 0.06, 90, { amp: amp * 0.8, d: 3 });
  }
}
function engine(t0, len, base, { amp = 0.12, type = 'saw', gears = 4, keke = false } = {}) {
  const f = (x) => {
    const r = Math.min(1, x / (len * 0.8));
    const inGear = (r * gears) % 1;
    return base * (1 + (0.35 + inGear * 0.65) * (keke ? 1.6 : 2.2) * (0.4 + 0.6 * r));
  };
  tone(t0, len, f, { type, amp, a: 0.3, d: 0.3, lp: keke ? 900 : 520 });
  tone(t0, len, (x) => f(x) / 2, { amp: amp * 0.8, a: 0.3, d: 0.3 });
}
function carHorn(t) {
  for (const fq of [415, 523]) tone(t, 0.45, fq, { type: 'saw', amp: 0.08, a: 0.01, d: 0.6, lp: 2400 });
}
function kekeHorn(t) {
  for (const o of [0, 0.17]) tone(t + o, 0.11, 740, { type: 'square', amp: 0.07, d: 1, lp: 2400 });
}
function ping(t) {
  tone(t, 0.14, 988, { amp: 0.16, d: 2 });
  tone(t + 0.1, 0.3, 1319, { amp: 0.14, d: 2 });
}
function sendSound(t) {
  hiss(t, 0.22, { f: 600, sweepTo: 4000, q: 2, amp: 0.25, a: 0.02, d: 1.5 });
}
function click(t) {
  tone(t, 0.035, 1200, { type: 'square', amp: 0.05, d: 3 });
}
function door(t) {
  hiss(t, 0.28, { f: 500, q: 0.7, amp: 0.3, d: 2 });
  tone(t + 0.02, 0.14, 180, { type: 'tri', amp: 0.15, d: 2 });
  hiss(t + 0.24, 0.06, { f: 1800, q: 3, amp: 0.25, d: 2 });
}
function whistle(t) {
  for (const [s, len] of [[0, 0.25], [0.32, 0.7]]) {
    tone(t + s, len, (x) => 2900 + 180 * Math.sin(2 * Math.PI * 32 * x), { amp: 0.09, a: 0.01, d: 0.4 });
  }
}
function bugle(t0) {
  // the game's original bugle call, on the natural harmonics of B-flat
  const n = { G: 233.1, C: 349.2, E: 466.2, G2: 587.3, C2: 698.5 };
  const tune = [[n.G, 0.3], [n.C, 0.3], [n.E, 0.6], [n.C, 0.3], [n.E, 0.3], [n.G2, 0.85], [n.E, 0.3], [n.G2, 0.3], [n.C2, 0.6], [n.G2, 0.3], [n.E, 0.3], [n.C, 1.1], [n.G, 1.4]];
  let t = t0;
  for (const [f, d] of tune) {
    tone(t, d, (x) => f * (0.985 + 0.015 * Math.min(1, x / 0.05)), { type: 'saw', amp: 0.21, a: 0.04, d: 0.7, lp: 2000, vib: 0.006 });
    tone(t, d, f * 2, { type: 'tri', amp: 0.08, a: 0.04, d: 0.7, vib: 0.006 });
    t += d + 0.04;
  }
}
function crickets(t0, len) {
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    const gate = (Math.sin(2 * Math.PI * 14 * t) > 0 ? 1 : 0) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t));
    add(s0 + i, Math.sin(2 * Math.PI * 4600 * t) * 0.018 * gate * Math.min(1, t, len - t), 0.3);
  }
}
function chime(t) {
  [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, 0.6, f, { type: 'tri', amp: 0.12, d: 1.6 }));
  tone(t + 0.36, 1.4, 1568, { amp: 0.08, d: 1.5 });
}

// ---------- arrange to the trailer's timeline ----------
const s = Object.fromEntries(tl.scenes.map((x) => [x.id, x]));
const end = (id) => s[id].start + s[id].dur;

// intro: build-up, title hit, then the beat drops at the first gameplay scene
impact(0.15, 0.8);
tone(0, s.gate.start, midi(57), { type: 'saw', amp: 0.03, a: 1.5, d: 0.6, lp: 900 });
tone(0, s.gate.start, midi(64), { type: 'saw', amp: 0.025, a: 1.5, d: 0.6, lp: 900 });
riser(s.gate.start - 2.2, 2.2);
impact(s.gate.start, 0.9);
groove(s.gate.start, s.retreat.start, { level: 1 });
// retreat: everything stops for the bugle
groove(s.retreat.start, end('retreat'), { level: 0.18, full: false });
bugle(s.retreat.start + 0.35);
// night: the beat comes back, darker
groove(s.night.start, s.end.start, { level: 0.75, lp: 900 });
crickets(s.night.start, s.night.dur + 1);
// end card
impact(s.end.start, 1);
groove(s.end.start, s.end.start + beat * 8, { level: 0.9 });
for (const m of minorChord(A + 12)) tone(s.end.start + beat * 8, 3, midi(m), { type: 'saw', amp: 0.05, a: 0.05, d: 1.2, lp: 1600 });
chime(s.end.start + 1.2);

// transitions
for (const id of ['drive', 'waka', 'phone', 'inside', 'provost', 'retreat', 'night']) whoosh(s[id].start);

// scene sounds
footsteps(s.gate.start + 0.25, end('gate') - 0.1, 0.38);
engine(s.drive.start, s.drive.dur, 40, { amp: 0.11 });
carHorn(s.drive.start + 2.2);
engine(s.waka.start, s.waka.dur, 62, { amp: 0.06, type: 'square', gears: 3, keke: true });
kekeHorn(s.waka.start + 0.8);
const ph = s.phone.start;
const pd = s.phone.dur;
click(ph + pd * 0.12);
sendSound(ph + pd * 0.2);
ping(ph + pd * 0.36);
click(ph + pd * 0.52);
sendSound(ph + pd * 0.58);
click(ph + pd * 0.78);
door(s.inside.start + 0.05);
door(s.inside.start + s.inside.dur / 2);
engine(s.provost.start, s.provost.dur, 40, { amp: 0.11 });
whistle(s.provost.start + 2.6);

// ---------- master: gentle limiter, fade out, write WAV ----------
const out = Buffer.alloc(44 + N * 4);
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = 0.9 / Math.max(1, peak * 0.85);
const fadeStart = (TOTAL - 1.2) * SR;
for (let i = 0; i < N; i++) {
  const fade = i > fadeStart ? Math.max(0, 1 - (i - fadeStart) / (1.2 * SR)) : 1;
  const l = Math.tanh(L[i] * gain) * fade;
  const r = Math.tanh(R[i] * gain) * fade;
  out.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
out.write('RIFF', 0);
out.writeUInt32LE(36 + N * 4, 4);
out.write('WAVEfmt ', 8);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write('data', 36);
out.writeUInt32LE(N * 4, 40);
writeFileSync(OUT, out);
console.log(`wrote ${OUT}: ${TOTAL.toFixed(1)}s, raw peak ${peak.toFixed(2)}`);
