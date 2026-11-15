import { mulberry32 } from './world';
import { audioContext } from './sfx';

/**
 * In-car radio. Every station is synthesised live with Web Audio (drums, bass, chords, lead),
 * so there are no audio files or licensed tracks. "Skip" generates a new song.
 */

interface Station {
  name: string;
  bpm: number;
  swing: number;
  kick: number[];
  clap: number[];
  shaker: boolean;
  bassSteps: number[];
  chordSteps: number[];
  scale: number[];
  root: number;
  lead: OscillatorType;
  logDrum?: boolean;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const STATIONS: Station[] = [
  { name: 'Arewa Vibes 98.1', bpm: 104, swing: 0.12, kick: [0, 7, 10], clap: [4, 12], shaker: true, bassSteps: [0, 3, 6, 10, 14], chordSteps: [2, 6, 10, 14], scale: MINOR, root: 45, lead: 'triangle' },
  { name: 'Highlife Gold 101.5', bpm: 120, swing: 0.05, kick: [0, 8], clap: [4, 12], shaker: true, bassSteps: [0, 4, 8, 11, 14], chordSteps: [0, 3, 6, 8, 11, 14], scale: MAJOR, root: 48, lead: 'square' },
  { name: 'Amapiano Night 104.9', bpm: 112, swing: 0.08, kick: [0, 4, 8, 12], clap: [4, 12], shaker: true, bassSteps: [0, 3, 6, 9, 12], chordSteps: [2, 10], scale: MINOR, root: 43, lead: 'sine', logDrum: true },
  { name: 'Campus Lo-fi 89.3', bpm: 80, swing: 0.18, kick: [0, 10], clap: [4, 12], shaker: false, bassSteps: [0, 8], chordSteps: [0, 8], scale: MAJOR, root: 50, lead: 'sine' },
];

const WORDS_A = ['Kaduna', 'Harmattan', 'Mammy Market', 'Hostel B', 'Retreat', 'Parade Ground', 'Night Class', 'Jollof', 'Keke', 'Suya'];
const WORDS_B = ['Nights', 'Love', 'Groove', 'Blues', 'Dance', 'Vibes', 'Anthem', 'Season', 'Gist', 'Waka'];
const ARTISTS = ['DJ Kilishi', 'Sky Cadet', 'Lady Zobo', 'MC Apron', 'The Lecturers', 'Hangar Boys', 'Amaka Keys', 'Sani Strings'];

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class Radio {
  station = 0;
  playing = false;
  volume = 0.6;
  track = { title: '', artist: '' };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private seed = 1;
  private prog: number[] = [];
  private melody: (number | null)[] = [];
  onChange?: () => void;

  private ensure() {
    if (this.ctx) return this.ctx;
    this.ctx = audioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  /** Must be called from a user gesture (click or key press) the first time. */
  play() {
    const ctx = this.ensure();
    ctx.resume().catch(() => {});
    if (this.playing) return;
    this.playing = true;
    this.newSong();
    this.nextTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.onChange?.();
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.onChange?.();
  }

  toggle() {
    if (this.playing) this.stop();
    else this.play();
  }

  setStation(i: number) {
    this.station = (i + STATIONS.length) % STATIONS.length;
    this.newSong();
    if (!this.playing) this.play();
    this.onChange?.();
  }

  skip() {
    this.newSong();
    this.onChange?.();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.05);
  }

  private newSong() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    const r = mulberry32(this.seed);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    this.track = { title: `${pick(WORDS_A)} ${pick(WORDS_B)}`, artist: pick(ARTISTS) };
    const degrees = [0, 3, 4, 5, 1];
    this.prog = [0, pick(degrees), pick(degrees), pick([3, 4])];
    this.melody = Array.from({ length: 32 }, () => (r() < 0.45 ? Math.floor(r() * 7) + (r() < 0.3 ? 7 : 0) : null));
  }

  private schedule() {
    const ctx = this.ctx!;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const t = this.nextTime + (s % 2 ? st.swing * stepDur : 0);
      const chordRoot = st.root + st.scale[this.prog[bar] % 7];
      if (st.kick.includes(s)) this.kick(t);
      if (st.clap.includes(s)) this.clap(t);
      if (st.shaker && s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.07 : 0.035);
      if (st.bassSteps.includes(s)) {
        if (st.logDrum) this.logDrum(t, chordRoot - 12, stepDur * 2);
        else this.tone(t, freq(chordRoot - 12), stepDur * 1.6, 'triangle', 0.32, 900);
      }
      if (st.chordSteps.includes(s)) {
        for (const deg of [0, 2, 4]) {
          const idx = this.prog[bar] + deg;
          this.tone(t, freq(st.root + 12 + st.scale[idx % 7] + 12 * Math.floor(idx / 7)), stepDur * 1.2, 'sawtooth', 0.05, 1800);
        }
      }
      const m = this.melody[(bar % 2) * 16 + s];
      if (m !== null && m !== undefined && s % 2 === 0) {
        const idx = m;
        this.tone(t, freq(st.root + 24 + st.scale[idx % 7] + 12 * Math.floor(idx / 7)), stepDur * 1.8, st.lead, 0.07, 3000);
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private env(t: number, peak: number, dur: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  private tone(t: number, f: number, dur: number, type: OscillatorType, peak: number, cutoff: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    o.connect(lp).connect(this.env(t, peak, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, 0.9, 0.3));
    o.start(t);
    o.stop(t + 0.35);
  }

  private logDrum(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq(midi) * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq(midi), t + 0.05);
    o.connect(this.env(t, 0.55, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseHit(t: number, peak: number, dur: number, type: BiquadFilterType, f: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    src.connect(flt).connect(this.env(t, peak, dur));
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private clap(t: number) {
    this.noiseHit(t, 0.3, 0.16, 'bandpass', 1500);
  }

  private hat(t: number, peak: number) {
    this.noiseHit(t, peak, 0.05, 'highpass', 7000);
  }

  get stationName() {
    return STATIONS[this.station].name;
  }
}
