import * as THREE from 'three';
import { ROADS, ROUNDABOUT } from './config';

/**
 * Road network as a graph, for ride-hailing routes. Roads are axis-aligned, so nodes are
 * road ends plus every crossing; edges join neighbouring nodes along each road.
 */
interface Node {
  x: number;
  z: number;
  edges: { to: number; cost: number }[];
}

const key = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;

export class RoadGraph {
  nodes: Node[] = [];
  private index = new Map<string, number>();
  private segs: { a: number; b: number }[] = [];

  constructor() {
    const centre = ROADS.map((r) => ({ x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2, horiz: r.z1 === r.z2 }));
    centre.forEach((r, i) => {
      const pts: [number, number][] = [[r.x1, r.z1], [r.x2, r.z2]];
      centre.forEach((o, j) => {
        if (i === j || o.horiz === r.horiz) return;
        const [hx1, hx2, hz] = r.horiz ? [Math.min(r.x1, r.x2), Math.max(r.x1, r.x2), r.z1] : [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2), o.z1];
        const [vz1, vz2, vx] = r.horiz ? [Math.min(o.z1, o.z2), Math.max(o.z1, o.z2), o.x1] : [Math.min(r.z1, r.z2), Math.max(r.z1, r.z2), r.x1];
        if (vx >= hx1 - 0.5 && vx <= hx2 + 0.5 && hz >= vz1 - 0.5 && hz <= vz2 + 0.5) pts.push([vx, hz]);
      });
      pts.sort((a, b) => (r.horiz ? a[0] - b[0] : a[1] - b[1]));
      for (let k = 0; k < pts.length - 1; k++) {
        const a = this.node(pts[k][0], pts[k][1]);
        const b = this.node(pts[k + 1][0], pts[k + 1][1]);
        if (a !== b) this.link(a, b);
      }
    });
  }

  private node(x: number, z: number) {
    const k = key(x, z);
    let i = this.index.get(k);
    if (i === undefined) {
      i = this.nodes.length;
      this.nodes.push({ x, z, edges: [] });
      this.index.set(k, i);
    }
    return i;
  }

  private link(a: number, b: number) {
    const cost = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
    this.nodes[a].edges.push({ to: b, cost });
    this.nodes[b].edges.push({ to: a, cost });
    this.segs.push({ a, b });
  }

  /** Closest point on any road centreline, and the segment it lies on. */
  nearest(x: number, z: number) {
    let best = { d: Infinity, x: 0, z: 0, seg: 0 };
    this.segs.forEach((s, i) => {
      const A = this.nodes[s.a];
      const B = this.nodes[s.b];
      const dx = B.x - A.x;
      const dz = B.z - A.z;
      const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / (dx * dx + dz * dz || 1)));
      const px = A.x + dx * t;
      const pz = A.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, x: px, z: pz, seg: i };
    });
    return best;
  }

  /** Shortest route between two world points, as road centreline points. */
  route(from: THREE.Vector3, to: THREE.Vector3): [number, number][] {
    const s = this.nearest(from.x, from.z);
    const e = this.nearest(to.x, to.z);
    const S = this.segs[s.seg];
    const E = this.segs[e.seg];
    if (s.seg === e.seg) return [[s.x, s.z], [e.x, e.z]];
    // Dijkstra from both ends of the start segment to both ends of the end segment.
    const n = this.nodes.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    const d0 = (i: number) => Math.hypot(this.nodes[i].x - s.x, this.nodes[i].z - s.z);
    dist[S.a] = d0(S.a);
    dist[S.b] = d0(S.b);
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (const ed of this.nodes[u].edges) {
        if (dist[u] + ed.cost < dist[ed.to]) {
          dist[ed.to] = dist[u] + ed.cost;
          prev[ed.to] = u;
        }
      }
    }
    const endCost = (i: number) => dist[i] + Math.hypot(this.nodes[i].x - e.x, this.nodes[i].z - e.z);
    let last = endCost(E.a) < endCost(E.b) ? E.a : E.b;
    const chain: number[] = [];
    while (last !== -1) {
      chain.unshift(last);
      last = prev[last];
    }
    const pts: [number, number][] = [[s.x, s.z], ...chain.map((i) => [this.nodes[i].x, this.nodes[i].z] as [number, number]), [e.x, e.z]];
    return this.aroundRoundabout(dedupe(pts));
  }

  /** Swing around the roundabout island (counter-clockwise on the map, keeping right) instead of through it. */
  private aroundRoundabout(pts: [number, number][]): [number, number][] {
    const out: [number, number][] = [];
    const R = ROUNDABOUT.island + 5;
    pts.forEach((p, i) => {
      const atCentre = Math.hypot(p[0] - ROUNDABOUT.x, p[1] - ROUNDABOUT.z) < 1;
      if (!atCentre || i === 0 || i === pts.length - 1) return void out.push(p);
      const a = pts[i - 1];
      const b = pts[i + 1];
      const angA = Math.atan2(a[1] - ROUNDABOUT.z, a[0] - ROUNDABOUT.x);
      const angB = Math.atan2(b[1] - ROUNDABOUT.z, b[0] - ROUNDABOUT.x);
      let sweep = angA - angB;
      while (sweep <= 0.2) sweep += Math.PI * 2;
      for (let t = 0.35; t < sweep; t += 0.7) out.push([ROUNDABOUT.x + Math.cos(angA - t) * R, ROUNDABOUT.z + Math.sin(angA - t) * R]);
    });
    return out;
  }

  length(pts: [number, number][]) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return d;
  }
}

function dedupe(pts: [number, number][]) {
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 2);
}
