// Edits the filmed frames + soundtrack into the final trailer with captions and title cards.
// usage: node compose.mjs <framesDir> <soundtrack.wav> <out.mp4>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';

const [dir, audio, out] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
const wide = tl.format === 'wide';
const W = wide ? 1920 : 1080;
const H = wide ? 1080 : 1920;
const here = dirname(new URL(import.meta.url).pathname);
const OSWALD = join(here, 'fonts/Oswald-Bold.ttf');
const INTER = join(here, 'fonts/Inter-SemiBold.ttf');
const txtDir = join(dir, 'captions');
mkdirSync(txtDir, { recursive: true });
const S = Object.fromEntries(tl.scenes.map((s) => [s.id, s]));

const CAPTIONS = {
  gate: ['START AT THE CHECKPOINT', 'Show your ID. Welcome to Force Life.'],
  drive: ['DRIVE ANYTHING', 'Saloons, SUVs, kekes and the campus shuttle'],
  waka: ['BOOK A WAKA RIDE', 'Keke, car or luxury, with your own radio'],
  phone: ['YOUR PHONE. YOUR PEOPLE.', 'Chat, snaps, photos and posts with real players'],
  inside: ['WALK INTO EVERY CLASS', 'Lecture theatres, hostel rooms and the caf'],
  provost: ['BREAK THE RULES?', 'The Provost is watching. Speed and you pay.'],
  retreat: ['6 PM. RETREAT.', 'The bugle sounds. Everyone stands still.'],
  night: ['DAY TURNS TO NIGHT', 'Make it back before curfew.'],
};

let n = 0;
const file = (text) => {
  const p = join(txtDir, `c${n++}.txt`);
  writeFileSync(p, text);
  return p;
};
// fit a line of text into the frame width
const fit = (text, base, emWidth, maxW) => Math.min(base, Math.floor(maxW / (text.length * emWidth)));
const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/** Text that fades and slides in at t0 and fades out at t1. */
function text(t, { font, size, color = 'white', y, t0, t1, slide = 0, shadow = true, box = false, cx = 0.5 }) {
  t0 = +t0.toFixed(2);
  t1 = +t1.toFixed(2);
  const fade = `if(lt(t,${t0}+0.25),(t-${t0})/0.25,if(gt(t,${t1}-0.25),(${t1}-t)/0.25,1))`;
  const x = slide ? `w*${cx}-text_w/2-${slide}*(1-min(1,(t-${t0})/0.3))` : `w*${cx}-text_w/2`;
  return (
    `drawtext=fontfile='${esc(font)}':textfile='${esc(file(t))}':fontsize=${size}:fontcolor=${color}` +
    `:x='${x}':y=${y}:alpha='${fade}':enable='between(t,${t0},${t1})'` +
    (shadow ? ':shadowcolor=black@0.7:shadowx=3:shadowy=3' : '') +
    (box ? ':box=1:boxcolor=black@0.5:boxborderw=22' : '')
  );
}

const f = [];
// ----- gameplay captions -----
for (const [id, [head, sub]] of Object.entries(CAPTIONS)) {
  const s = S[id];
  const t0 = +(s.start + 0.3).toFixed(2);
  const t1 = +(s.start + s.dur - 0.2).toFixed(2);
  const hs = fit(head, wide ? 96 : 92, 0.5, wide && id === 'phone' ? W * 0.6 : W * 0.88);
  const ss = fit(sub, wide ? 40 : 40, 0.56, wide && id === 'phone' ? W * 0.6 : W * 0.86);
  const y = wide ? Math.round(H * 0.68) : Math.round(H * 0.2);
  // in the wide phone scene, keep captions clear of the phone on the right
  const cx = wide && id === 'phone' ? 0.36 : 0.5;
  const maxW = wide && id === 'phone' ? W * 0.62 : W * 0.88;
  f.push(`drawbox=x=iw*${cx}-${Math.round(W * 0.03)}:y=${y - 26}:w=${Math.round(W * 0.06)}:h=8:color=0xF2C14E@0.95:t=fill:enable='between(t,${t0},${t1})'`);
  f.push(text(head, { font: OSWALD, size: hs, y, t0, t1, slide: 70, box: true, cx }));
  f.push(text(sub, { font: INTER, size: ss, y: y + hs + 44, t0: t0 + 0.15, t1, box: true, cx }));
  void maxW;
}

// ----- title card -----
const ti = S.title;
f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill:enable='between(t,0,${ti.dur})'`);
f.push(text('FORCE LIFE', { font: OSWALD, size: wide ? 210 : 170, y: `(h/2)-${wide ? 170 : 150}`, t0: 0.15, t1: ti.dur - 0.05 }));
f.push(text('A NEW OPEN-WORLD CAMPUS GAME', { font: INTER, size: wide ? 46 : 40, color: '0xF2C14E', y: `(h/2)+${wide ? 75 : 50}`, t0: 0.6, t1: ti.dur - 0.05 }));
f.push(text('Drive. Chat. Ride. Beat curfew.', { font: INTER, size: wide ? 38 : 34, y: `(h/2)+${wide ? 145 : 115}`, t0: 1.1, t1: ti.dur - 0.05 }));
// white flash when the beat drops
f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.55:t=fill:enable='between(t,${S.gate.start},${S.gate.start + 0.09})'`);
f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.25:t=fill:enable='between(t,${S.gate.start + 0.09},${S.gate.start + 0.17})'`);

// ----- end card -----
const e = S.end;
f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill:enable='between(t,${e.start},${e.start + e.dur + 1})'`);
f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.5:t=fill:enable='between(t,${e.start},${e.start + 0.08})'`);
f.push(text('PLAY FREE NOW', { font: OSWALD, size: wide ? 160 : 130, y: `(h/2)-${wide ? 200 : 210}`, t0: e.start + 0.1, t1: e.start + e.dur + 0.6 }));
f.push(text('force-life.vercel.app', { font: OSWALD, size: wide ? 92 : 78, color: '0xF2C14E', y: `(h/2)+${wide ? 0 : -20}`, t0: e.start + 0.5, t1: e.start + e.dur + 0.6 }));
f.push(text('Android  •  iPhone  •  PC  —  in your browser, no download', { font: INTER, size: wide ? 40 : 34, y: `(h/2)+${wide ? 130 : 100}`, t0: e.start + 0.9, t1: e.start + e.dur + 0.6 }));
f.push(text('Fictional campus. Not affiliated with any real institution.', { font: INTER, size: wide ? 24 : 24, color: 'white@0.7', y: `h-${wide ? 70 : 120}`, t0: e.start + 0.9, t1: e.start + e.dur + 0.6, shadow: false }));
// fade to black at the very end
f.push(`fade=t=out:st=${(tl.total - 0.6).toFixed(2)}:d=0.6`);

const graph = `[0:v]scale=${W}:${H}:flags=lanczos,format=yuv420p,${f.join(',')}[v];[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:${tl.total}[a]`;
const script = join(dir, 'filter.txt');
writeFileSync(script, graph);
execFileSync(
  'ffmpeg',
  ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(tl.fps), '-i', join(dir, 'f%05d.jpg'), '-i', audio,
    '-filter_complex_script', script, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', '-shortest', out],
  { stdio: 'inherit' },
);
console.log('wrote', out);
