// engine.mjs — Forest Radar core: Radio Tomographic Imaging (device-free).
// Pure, DOM-free, reused by radar.html (inlined) and the Node self-test.

export const PLOT = { W: 60, H: 40 }; // monitored plot in metres

/** 8 perimeter nodes (corners + edge midpoints) around a W×H plot. */
export function makeNodes(W = PLOT.W, H = PLOT.H) {
  return [
    { id: "W1", x: 0, y: 0 }, { id: "W2", x: W / 2, y: 0 }, { id: "W3", x: W, y: 0 },
    { id: "W4", x: W, y: H / 2 }, { id: "W5", x: W, y: H }, { id: "W6", x: W / 2, y: H },
    { id: "W7", x: 0, y: H }, { id: "W8", x: 0, y: H / 2 },
  ];
}
export function makeLinks(nodes) {
  const L = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) L.push([i, j]);
  return L;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** RTI reconstruction via weighted ellipse back-projection (single-target robust). */
export class RTI {
  constructor(nodes, links, opts = {}) {
    this.nodes = nodes; this.links = links;
    this.W = opts.W ?? PLOT.W; this.H = opts.H ?? PLOT.H;
    this.gx = opts.gx ?? 36; this.gy = opts.gy ?? 24;
    this.lambda = opts.lambda ?? 3.0; // ellipse excess path (m): width of a link's sensitivity band
    this.build();
  }
  cell(cx, cy) { return { x: (cx + 0.5) * this.W / this.gx, y: (cy + 0.5) * this.H / this.gy }; }
  build() {
    const P = this.gx * this.gy;
    this.linkPix = this.links.map(() => []);
    this.pixNorm = new Float64Array(P);
    this.links.forEach((lk, li) => {
      const a = this.nodes[lk[0]], b = this.nodes[lk[1]]; const D = dist(a, b);
      for (let cy = 0; cy < this.gy; cy++) for (let cx = 0; cx < this.gx; cx++) {
        const q = this.cell(cx, cy); const p = cy * this.gx + cx;
        const e = Math.hypot(q.x - a.x, q.y - a.y) + Math.hypot(q.x - b.x, q.y - b.y) - D;
        if (e < this.lambda) { const w = 1 / Math.sqrt(D); this.linkPix[li].push([p, w]); this.pixNorm[p] += w; }
      }
    });
  }
  /** drops: per-link attenuation (>=0). Returns {image, max, person|null}. */
  step(drops, detectThresh = 1.0) {
    const P = this.gx * this.gy; const img = new Float64Array(P);
    this.linkPix.forEach((lst, li) => { const d = drops[li]; if (d <= 0) return; for (const [p, w] of lst) img[p] += w * d; });
    let mx = 0;
    for (let p = 0; p < P; p++) { if (this.pixNorm[p] > 0) img[p] /= this.pixNorm[p]; if (img[p] > mx) mx = img[p]; }
    let person = null;
    if (mx >= detectThresh) {
      const thr = mx * 0.6; let sx = 0, sy = 0, sw = 0;
      for (let p = 0; p < P; p++) if (img[p] >= thr) { const cx = p % this.gx, cy = (p / this.gx) | 0; const c = this.cell(cx, cy); sx += c.x * img[p]; sy += c.y * img[p]; sw += img[p]; }
      if (sw > 0) person = { x: sx / sw, y: sy / sw, conf: mx };
    }
    return { image: img, max: mx, person };
  }
}

/** Forest simulator: a person walks; links on their line-of-sight attenuate + noise. */
export class Sim {
  constructor(nodes, links, opts = {}) {
    this.nodes = nodes; this.links = links;
    this.W = opts.W ?? PLOT.W; this.H = opts.H ?? PLOT.H;
    this.noise = opts.noise ?? 0.35; this.A = opts.A ?? 6; this.lam = opts.lam ?? 4; this.t = 0;
  }
  personPos(t) { return { x: this.W / 2 + this.W * 0.32 * Math.sin(t * 0.55), y: this.H / 2 + this.H * 0.34 * Math.sin(t * 0.83 + 1) }; }
  frame(dt, present = true) {
    this.t += dt; const Pp = this.personPos(this.t);
    const drops = this.links.map((lk) => {
      let att = 0;
      if (present) { const a = this.nodes[lk[0]], b = this.nodes[lk[1]]; const D = dist(a, b);
        const e = Math.hypot(Pp.x - a.x, Pp.y - a.y) + Math.hypot(Pp.x - b.x, Pp.y - b.y) - D;
        if (e < this.lam) att = this.A * Math.max(0, 1 - e / this.lam); }
      att += (Math.random() - 0.5) * 2 * this.noise;
      return Math.max(0, att);
    });
    return { drops, truth: present ? Pp : null };
  }
}
