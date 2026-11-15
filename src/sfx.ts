import type { VKind } from './config';

/**
 * Sound effects and ambience, all synthesised with Web Audio (no audio files).
 * One AudioContext is shared with the radio. Browsers only allow sound after the
 * player's first tap or key press, so the context unlocks itself on that gesture.
 */

let shared: AudioContext | null = null;
export function audioContext(): AudioContext {
  if (!shared) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    shared = new AC();
  }
  return shared;
}

type Engine = { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; kind: VKind };

const ENGINE: Record<VKind, { base: number; rev: number; type: OscillatorType; cutoff: number; vol: number }> = {
  keke: { base: 62, rev: 3.2, type: 'square', cutoff: 900, vol: 0.06 },
  car: { base: 38, rev: 2.6, type: 'sawtooth', cutoff: 520, vol: 0.09 },
  suv: { base: 34, rev: 2.4, type: 'sawtooth', cutoff: 480, vol: 0.1 },
  pickup: { base: 32, rev: 2.4, type: 'sawtooth', cutoff: 460, vol: 0.1 },
  bus: { base: 26, rev: 1.9, type: 'sawtooth', cutoff: 380, vol: 0.12 },
};

export class Sound {
  ctx = audioContext();
  private master: GainNode;
  private sfx: GainNode;
  private amb: GainNode;
  private noise: AudioBuffer;
  private engine: Engine | null = null;
  private screech: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wind: GainNode;
  private crickets: GainNode;
  private fanHum: GainNode;
  private nextBird = 0;
  private sfxVol = 0.8;
  private ambOn = true;
  private paused = false;

  constructor() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < d.length; i++) {
      // half white, half brown noise: useful for both hiss and rumble
      const w = Math.random() * 2 - 1;
      brown = (brown + 0.02 * w) / 1.02;
      d[i] = i % 2 ? w * 0.6 : brown * 3.5;
    }

    // continuous beds: wind/far traffic, night crickets, indoor fan hum
    this.wind = this.loopNoise('lowpass', 380, 0);
    this.fanHum = ctx.createGain();
    this.fanHum.gain.value = 0;
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 100;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 300;
    hum.connect(humLp).connect(this.fanHum).connect(this.amb);
    hum.start();
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    const chirp = ctx.createOscillator();
    chirp.frequency.value = 4600;
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 14;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(pulse.gain);
    const slow = ctx.createOscillator();
    slow.frequency.value = 0.7;
    const slowGain = ctx.createGain();
    slowGain.gain.value = 0.5;
    slow.connect(slowGain).connect(pulse.gain);
    chirp.connect(pulse).connect(this.crickets).connect(this.amb);
    chirp.start();
    lfo.start();
    slow.start();

    const unlock = () => {
      ctx.resume().catch(() => {});
      if (ctx.state === 'running') {
        removeEventListener('pointerdown', unlock);
        removeEventListener('keydown', unlock);
      }
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  setVolumes(sfx: number, ambience: boolean) {
    this.sfxVol = sfx;
    this.ambOn = ambience;
    this.applyLevels();
  }

  setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    this.applyLevels();
  }

  private applyLevels() {
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.paused ? 0 : this.sfxVol, t, 0.05);
    this.amb.gain.setTargetAtTime(this.paused || !this.ambOn ? 0 : this.sfxVol * 0.8, t, 0.2);
  }

  // ---------- building blocks ----------
  private loopNoise(type: BiquadFilterType, f: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(flt).connect(g).connect(this.amb);
    src.start();
    return g;
  }

  /** Output node with volume and stereo pan, for one-shot sounds. */
  private out(vol: number, pan = 0, bus = this.sfx) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(bus);
    return g;
  }

  private env(dest: AudioNode, t: number, attack: number, hold: number, release: number, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(dest);
    return g;
  }

  private tone(dest: AudioNode, t: number, f: number, dur: number, type: OscillatorType = 'sine', peak = 0.5, attack = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(this.env(dest, t, attack, dur * 0.3, dur * 0.7, peak));
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  private burst(dest: AudioNode, t: number, type: BiquadFilterType, f: number, dur: number, peak = 0.5, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    src.connect(flt).connect(this.env(dest, t, 0.003, 0, dur, peak));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private get live() {
    return this.ctx.state === 'running' && !this.paused;
  }

  // ---------- player ----------
  footstep(run: boolean, indoors: boolean) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const o = this.out(run ? 0.5 : 0.32, (Math.random() - 0.5) * 0.1);
    this.burst(o, t, 'bandpass', indoors ? 2400 : 900 + Math.random() * 300, run ? 0.07 : 0.06, 0.8, indoors ? 2.5 : 1.2);
    this.tone(o, t, indoors ? 140 : 90, 0.05, 'sine', 0.35);
  }

  door() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const o = this.out(0.5);
    this.burst(o, t, 'lowpass', 600, 0.25, 0.6);
    this.tone(o, t + 0.02, 180, 0.12, 'triangle', 0.3);
    this.burst(o, t + 0.22, 'bandpass', 1800, 0.05, 0.5, 3);
  }

  // ---------- vehicles ----------
  /** Call every frame: the vehicle the player is driving or riding in, or null. */
  engineUpdate(v: { kind: VKind; speed: number; maxSpeed: number; throttle: number } | null, inside: boolean) {
    const ctx = this.ctx;
    if (!v) {
      if (this.engine) {
        const e = this.engine;
        e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        setTimeout(() => {
          e.osc.stop();
          e.sub.stop();
        }, 800);
        this.engine = null;
      }
      return;
    }
    const spec = ENGINE[v.kind];
    if (!this.engine || this.engine.kind !== v.kind) {
      this.engineUpdate(null, false);
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(this.sfx);
      osc.start();
      sub.start();
      this.engine = { osc, sub, filter, gain, kind: v.kind };
    }
    const e = this.engine;
    const r = Math.min(1, Math.abs(v.speed) / v.maxSpeed);
    // simple gearbox: revs climb, then drop at each shift
    const gears = v.kind === 'keke' ? 3 : 5;
    const inGear = (r * gears) % 1;
    const rpm = 0.25 + 0.75 * (r < 0.02 ? 0 : 0.35 + inGear * 0.65) * (0.6 + 0.4 * Math.max(0, v.throttle));
    const f = spec.base * (1 + rpm * spec.rev);
    const t = ctx.currentTime;
    e.osc.frequency.setTargetAtTime(f, t, 0.06);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
    e.filter.frequency.setTargetAtTime(spec.cutoff * (inside ? 0.6 : 1) * (1 + rpm), t, 0.08);
    e.gain.gain.setTargetAtTime(spec.vol * (inside ? 0.55 : 1) * (0.55 + 0.45 * rpm), t, 0.08);
  }

  horn(kind: VKind, vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const o = this.out(0.22 * vol, pan);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(o);
    if (kind === 'keke') {
      // the classic keke "pim-pim"
      for (const dt of [0, 0.16]) this.tone(lp, t + dt, 740, 0.1, 'square', 0.5);
    } else {
      const [a, b] = kind === 'bus' ? [262, 330] : [415, 523];
      this.tone(lp, t, a, 0.42, 'sawtooth', 0.45, 0.01);
      this.tone(lp, t, b, 0.42, 'sawtooth', 0.4, 0.01);
    }
  }

  skid(on: boolean, intensity = 1) {
    const ctx = this.ctx;
    if (on && !this.screech && this.live) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(this.sfx);
      src.start();
      this.screech = { src, gain };
    }
    if (this.screech) {
      this.screech.gain.gain.setTargetAtTime(on ? 0.12 * Math.min(1, intensity) : 0, ctx.currentTime, 0.05);
      if (!on) {
        const s = this.screech;
        this.screech = null;
        setTimeout(() => s.src.stop(), 300);
      }
    }
  }

  crash(strength: number) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const o = this.out(Math.min(1, 0.3 + strength * 0.08));
    this.burst(o, t, 'lowpass', 500, 0.35, 0.9);
    this.tone(o, t, 70, 0.2, 'sine', 0.8);
    this.burst(o, t + 0.03, 'highpass', 3500, 0.15, 0.25);
  }

  // ---------- base life ----------
  whistle() {
    if (!this.live) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(0.18);
    for (const [start, len] of [[0, 0.25], [0.32, 0.7]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 2900;
      const trill = ctx.createOscillator();
      trill.frequency.value = 32;
      const depth = ctx.createGain();
      depth.gain.value = 180;
      trill.connect(depth).connect(osc.frequency);
      osc.connect(this.env(o, t + start, 0.01, len * 0.8, len * 0.2, 0.6));
      osc.start(t + start);
      trill.start(t + start);
      osc.stop(t + start + len + 0.05);
      trill.stop(t + start + len + 0.05);
    }
  }

  /** An original bugle call for the 6 PM Retreat. */
  bugle() {
    if (this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + 0.1;
    const o = this.out(0.22);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    lp.connect(o);
    // bugles only play the natural harmonics of one note (here Bb): Bb3 F4 Bb4 D5 F5
    const n = { G: 233.1, C: 349.2, E: 466.2, G2: 587.3, C2: 698.5 };
    const tune: [number, number][] = [
      [n.G, 0.35], [n.C, 0.35], [n.E, 0.7], [n.C, 0.35], [n.E, 0.35], [n.G2, 1.0],
      [n.E, 0.35], [n.G2, 0.35], [n.C2, 0.7], [n.G2, 0.35], [n.E, 0.35], [n.C, 1.4],
      [n.G, 0.35], [n.C, 0.35], [n.E, 0.5], [n.C, 0.5], [n.G, 2.2],
    ];
    let t = t0;
    for (const [f, d] of tune) {
      for (const [type, mul, peak] of [['sawtooth', 1, 0.35], ['triangle', 2, 0.18]] as const) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f * mul * 0.985, t);
        osc.frequency.linearRampToValueAtTime(f * mul, t + 0.05);
        const vib = this.ctx.createOscillator();
        vib.frequency.value = 5;
        const vd = this.ctx.createGain();
        vd.gain.value = f * 0.006;
        vib.connect(vd).connect(osc.frequency);
        osc.connect(this.env(lp, t, 0.04, d * 0.75, d * 0.2, peak));
        osc.start(t);
        vib.start(t);
        osc.stop(t + d + 0.05);
        vib.stop(t + d + 0.05);
      }
      t += d + 0.05;
    }
  }

  // ---------- feedback ----------
  objective() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const o = this.out(0.25);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(o, t + i * 0.09, f, 0.35, 'triangle', 0.5));
    this.tone(o, t + 0.36, 1568, 0.6, 'sine', 0.25);
  }

  cash() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const o = this.out(0.25);
    this.burst(o, t, 'highpass', 5000, 0.08, 0.4);
    this.tone(o, t + 0.05, 1760, 0.25, 'sine', 0.4);
    this.tone(o, t + 0.12, 2637, 0.4, 'sine', 0.35);
  }

  ping() {
    if (this.ctx.state !== 'running' || this.paused) return;
    const t = this.ctx.currentTime;
    const o = this.out(0.22);
    this.tone(o, t, 988, 0.12, 'sine', 0.6);
    this.tone(o, t + 0.1, 1319, 0.25, 'sine', 0.5);
  }

  send() {
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const o = this.out(0.2);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.18);
    src.connect(bp).connect(this.env(o, t, 0.01, 0.08, 0.12, 0.8));
    src.start(t);
    src.stop(t + 0.3);
  }

  shutter() {
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const o = this.out(0.35);
    this.burst(o, t, 'highpass', 2500, 0.03, 0.9);
    this.burst(o, t + 0.07, 'bandpass', 1500, 0.05, 0.7, 2);
  }

  click() {
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(this.out(0.12), t, 1200, 0.03, 'square', 0.3);
  }

  // ---------- ambience ----------
  ambience(dt: number, day: number, indoors: { fans: boolean } | null) {
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const outside = indoors ? 0.15 : 1;
    this.wind.gain.setTargetAtTime(0.05 * outside, t, 0.5);
    this.crickets.gain.setTargetAtTime((1 - day) * 0.012 * outside, t, 1);
    this.fanHum.gain.setTargetAtTime(indoors?.fans ? 0.035 : 0, t, 0.3);
    // birds by day, outdoors
    this.nextBird -= dt;
    if (this.nextBird <= 0 && !indoors && day > 0.4 && !this.paused) {
      this.nextBird = 1.5 + Math.random() * 4;
      this.bird((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.6);
    }
  }

  private bird(pan: number, vol: number) {
    const t = this.ctx.currentTime;
    const o = this.out(0.05 * vol, pan, this.amb);
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(base, s);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), s + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, s + 0.08);
      osc.connect(this.env(o, s, 0.005, 0.03, 0.05, 0.8));
      osc.start(s);
      osc.stop(s + 0.12);
    }
  }
}
