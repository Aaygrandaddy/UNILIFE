import * as THREE from 'three';

// All textures are drawn on canvases at load time, so the game ships with no image assets.

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, dots: number, spread: number) {
  for (let i = 0; i < dots; i++) {
    const v = (Math.random() - 0.5) * spread;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    const s = Math.random() * 2 + 0.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

function blotches(ctx: CanvasRenderingContext2D, size: number, colors: string[], n: number, maxR: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * maxR + 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colors[i % colors.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    // draw wrapped so the tile repeats seamlessly
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

export function plain(base: string, spread = 0.12, size = 256): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size * 20, spread);
  return finish(c);
}

export function grass(): THREE.CanvasTexture {
  const size = 512;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#6a7d3e';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, ['#7d8f45', '#55702f', '#9a9150', '#6a7f38', '#a39a5c'], 170, 70, 0.38);
  for (let i = 0; i < 9000; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(140,170,80,0.35)' : 'rgba(40,60,20,0.35)';
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - Math.random() * 5);
    ctx.stroke();
  }
  return finish(c);
}

export function laterite(): THREE.CanvasTexture {
  const size = 512;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#9b5b36';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, ['#b06a3e', '#874b2b', '#a8704a', '#7a5a3a'], 140, 80, 0.35);
  speckle(ctx, size, 14000, 0.25);
  return finish(c);
}

export function road(): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#3b3c3e';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, Math.max(w, h), 12000, 0.22);
  blotches(ctx, h, ['#2e2f31', '#47484a'], 30, 40, 0.25);
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  ctx.fillRect(5, 0, 3, h);
  ctx.fillRect(w - 8, 0, 3, h);
  ctx.fillStyle = 'rgba(240,240,230,0.9)';
  ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  return finish(c);
}

export function paving(): THREE.CanvasTexture {
  const size = 256;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#6f6660';
  ctx.fillRect(0, 0, size, size);
  const bw = 32;
  const bh = 16;
  for (let y = 0; y < size; y += bh) {
    const off = (y / bh) % 2 ? bw / 2 : 0;
    for (let x = -bw; x < size + bw; x += bw) {
      const pick = Math.random();
      ctx.fillStyle = pick < 0.5 ? '#9a8d82' : pick < 0.8 ? '#a0705e' : '#8a8178';
      ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
  speckle(ctx, size, 4000, 0.18);
  return finish(c);
}

export function stripes(a: string, b: string, n = 8): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 32);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? a : b;
    ctx.fillRect((i * 256) / n, 0, 256 / n + 1, 32);
  }
  return finish(c);
}

const facadeCache = new Map<string, { map: THREE.Texture; emissive: THREE.Texture }>();

/** A 4 x 4 grid of window bays. One tile covers 16 m x 14.4 m of wall. */
export function facade(wall: string, glass: string, style: 'window' | 'strip' | 'hostel'): { map: THREE.Texture; emissive: THREE.Texture } {
  const key = wall + glass + style;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const size = 512;
  const cell = size / 4;
  const a = makeCanvas(size, size);
  const e = makeCanvas(size, size);
  a.ctx.fillStyle = wall;
  a.ctx.fillRect(0, 0, size, size);
  speckle(a.ctx, size, 6000, 0.1);
  e.ctx.fillStyle = '#000';
  e.ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < 4; row++) {
    // floor slab line
    a.ctx.fillStyle = 'rgba(0,0,0,0.12)';
    a.ctx.fillRect(0, row * cell + cell - 6, size, 6);
    if (style === 'strip') {
      const y = row * cell + 34;
      const g = a.ctx.createLinearGradient(0, y, 0, y + 56);
      g.addColorStop(0, glass);
      g.addColorStop(1, '#0d1720');
      a.ctx.fillStyle = g;
      a.ctx.fillRect(0, y, size, 56);
      a.ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let x = 0; x < size; x += 32) a.ctx.fillRect(x, y, 3, 56);
      for (let x = 0; x < size; x += 32) {
        if (Math.random() < 0.45) {
          e.ctx.fillStyle = Math.random() < 0.5 ? '#ffe2b0' : '#cfe6ff';
          e.ctx.fillRect(x + 3, y, 29, 56);
        }
      }
      continue;
    }
    for (let col = 0; col < 4; col++) {
      const x = col * cell;
      const y = row * cell;
      const wx = x + 26;
      const wy = y + 28;
      const ww = cell - 52;
      const wh = style === 'hostel' ? 64 : 70;
      a.ctx.fillStyle = 'rgba(255,255,255,0.5)';
      a.ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      const g = a.ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, glass);
      g.addColorStop(1, '#0e1822');
      a.ctx.fillStyle = g;
      a.ctx.fillRect(wx, wy, ww, wh);
      a.ctx.fillStyle = 'rgba(255,255,255,0.6)';
      a.ctx.fillRect(wx + ww / 2 - 1, wy, 3, wh);
      if (style === 'hostel') {
        // burglary-proof bars, very common on Nigerian hostels
        a.ctx.fillStyle = 'rgba(40,40,40,0.65)';
        for (let bx = wx + 8; bx < wx + ww; bx += 10) a.ctx.fillRect(bx, wy, 2, wh);
      }
      a.ctx.fillStyle = 'rgba(0,0,0,0.25)';
      a.ctx.fillRect(wx - 6, wy + wh + 5, ww + 12, 5);
      if (Math.random() < 0.4) {
        e.ctx.fillStyle = Math.random() < 0.65 ? '#ffd79a' : '#d8ecff';
        e.ctx.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const out = { map: finish(a.c), emissive: finish(e.c) };
  facadeCache.set(key, out);
  return out;
}

export function sign(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; sub?: string; border?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 1024;
  const h = opts.h ?? 160;
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = opts.bg ?? '#0f3d2a';
  ctx.fillRect(0, 0, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }
  ctx.fillStyle = opts.fg ?? '#f5e7b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.floor(h * (opts.sub ? 0.42 : 0.55));
  ctx.font = `700 ${size}px "Arial Narrow", Arial, sans-serif`;
  while (ctx.measureText(text).width > w * 0.92 && size > 10) {
    size -= 2;
    ctx.font = `700 ${size}px "Arial Narrow", Arial, sans-serif`;
  }
  ctx.fillText(text, w / 2, opts.sub ? h * 0.38 : h / 2);
  if (opts.sub) {
    ctx.font = `500 ${Math.floor(h * 0.2)}px Arial, sans-serif`;
    ctx.fillText(opts.sub, w / 2, h * 0.78);
  }
  return finish(c, false);
}

export function flagNigeria(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(96, 48);
  ctx.fillStyle = '#008751';
  ctx.fillRect(0, 0, 96, 48);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(32, 0, 32, 48);
  return finish(c, false);
}

export function flagUni(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(96, 48);
  ctx.fillStyle = '#123f6b';
  ctx.fillRect(0, 0, 96, 48);
  ctx.fillStyle = '#e6b422';
  ctx.beginPath();
  ctx.arc(48, 24, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#123f6b';
  ctx.font = '700 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', 48, 25);
  return finish(c, false);
}

export function clockFace(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#f7f3e8';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 5;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4);
  }
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(64, 64);
  ctx.lineTo(64, 28);
  ctx.moveTo(64, 64);
  ctx.lineTo(90, 70);
  ctx.stroke();
  return finish(c, false);
}

const camoCache = new Map<string, THREE.CanvasTexture>();
/** Blotchy camouflage, used for airmen's uniforms. */
export function camo(colors: string[]): THREE.CanvasTexture {
  const key = colors.join();
  const hit = camoCache.get(key);
  if (hit) return hit;
  const size = 128;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = colors[1 + (i % (colors.length - 1))];
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const r = 4 + Math.random() * 9;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
  }
  const t = finish(c);
  t.repeat.set(2, 2);
  camoCache.set(key, t);
  return t;
}

export function roundel(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#008751';
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#008751';
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false);
}

export function tiles(base: string, grout: string, n = 4): THREE.CanvasTexture {
  const size = 256;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const t = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = base;
      ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
  }
  speckle(ctx, size, 5000, 0.12);
  return finish(c);
}

/** A board with a title and lines of text, for menus, notices and lecture slides. */
export function board(title: string, lines: string[], opts: { bg?: string; fg?: string; accent?: string; w?: number; h?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 1024;
  const h = opts.h ?? 640;
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = opts.bg ?? '#1d2b22';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.accent ?? '#f3d27a';
  ctx.font = `700 ${Math.round(h * 0.1)}px Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(title, w * 0.05, h * 0.06);
  ctx.fillStyle = opts.fg ?? '#f4f1e8';
  const lh = (h * 0.72) / Math.max(lines.length, 5);
  ctx.font = `500 ${Math.round(lh * 0.62)}px Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, w * 0.06, h * 0.24 + i * lh));
  return finish(c, false);
}
