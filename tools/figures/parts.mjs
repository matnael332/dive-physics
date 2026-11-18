// Shared parts for the figure builds: a recorder bound to one camera, and the helpers that
// draw a part and record its true shape at the same time (for painter's order and the audit).
import * as k from '../../vendor/anatomy/iso-kit.mjs';
import * as G from '../../vendor/anatomy/lathe.mjs';
import * as A from '../../vendor/anatomy/audit.mjs';
import { tubePieces, tubeSvg } from '../../vendor/anatomy/tube.mjs';
import { prismAny as prismOfAny, cspSafe } from '../../src/figures/draw.js';

export { k, G, A };

export const END_ARC = (40 * Math.PI) / 180;
export const radial = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];

// back half of a ring (angles t0..t1, the side y < cy by default) as a floor outline
export function halfRing(cx, cy, rIn, rOut, steps = 56, t0 = Math.PI, t1 = 2 * Math.PI) {
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (i / steps) * (t1 - t0);
    outer.push([cx + rOut * Math.cos(t), cy + rOut * Math.sin(t)]);
    if (rIn > 0) inner.unshift([cx + rIn * Math.cos(t), cy + rIn * Math.sin(t)]);
  }
  return [...outer, ...inner];
}

export function bench(P) {
  const V = G.viewOf(P);
  const KS = G.scaleOf(P);
  const R = A.recorder(P);
  const record = R.solid;
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const Ln = (d, style) => k.lineSvg(d, style);
  const Dots = (points, style) => k.dotsSvg(points, style);
  const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
  const prismAny = (F, ring, s0, s1) => prismOfAny(F, ring, s0, s1, P);

  function put(name, ref, svg, shapes = [], { bias = 0, part, ...rest } = {}) {
    const body = part ? `<g data-part="${part}">${svg}</g>` : svg;
    return R.put({ name, at: ref, bias, svg: body, shapes, piece: 'bench', ...rest });
  }

  // a vertical section cut by y = cy: a C ring (rIn > 0, in a main piece and an end piece) or a D disc
  function cutZ(name, cx, cy, [z0, z1, rIn, rOut], style = {}, { bias = 0, part, owner, inner = '', extra = '', t0 = Math.PI } = {}) {
    const quad = (xa, xb) => `<path class="fig-cut" d="${path3([[xa, cy, z0], [xb, cy, z0], [xb, cy, z1], [xa, cy, z1]], true)}"/>`;
    const made = [];
    const piece = (pname, a, b, cuts, more, extraSvg) => {
      const ring = halfRing(cx, cy, rIn, rOut, Math.max(6, Math.round((56 * (b - a)) / Math.PI)), a, b);
      const paths = k.extrude(ring, z0, z1 - z0, P, { convex: rIn <= 0 });
      const shape = record(A.extruded(ring, z0, z1 - z0, { name: pname, owner }));
      made.push(shape);
      const mid = (a + b) / 2;
      const ref = [cx + Math.cos(mid) * (rIn + rOut) * 0.5, cy + Math.sin(mid) * (rIn + rOut) * 0.5, (z0 + z1) / 2];
      put(pname, ref, S(paths, { tone: 'mid', ...style, inner: (style.lit ? '' : cuts) + more }) + extraSvg, [shape], { bias, part });
    };
    if (rIn <= 0) {
      piece(name, t0, 2 * Math.PI, quad(cx - rOut, cx + rOut), inner, extra);
      return made;
    }
    const left = t0 === Math.PI ? quad(cx - rOut, cx - rIn) : '';
    piece(name, t0, 2 * Math.PI - END_ARC, left, inner, extra);
    piece(`${name}.end`, 2 * Math.PI - END_ARC, 2 * Math.PI, quad(cx + rIn, cx + rOut), '', '');
    return made;
  }

  // a turned part on any axis
  function turned(name, F, profile, style = {}, { bias = 0, part, owner, inner = '', extra = '', steps, seated, cut } = {}) {
    const paths = G.solidOf(profile, F, P, steps ? { steps } : {});
    const shape = record(A.solid(F, profile, { name, owner, ...(seated ? { seated, cut } : {}) }));
    const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
    return put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: 'mid', ...style, inner }) + extra, [shape], { bias, part });
  }
  function box(name, plan, z0, z1, style = {}, { bias = 0, part, owner, inner = '', extra = '', steps = 3, bevel = 0.5 } = {}) {
    const shape = record(A.slab(plan, z0, z1 - z0, { name, owner }, steps));
    return put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: 'mid', ...style, inner }) + extra, [shape], { bias, part });
  }
  function cyl(name, cx, cy, r, z0, z1, style = {}, { bias = 0, part, owner, inner = '', extra = '', steps = 40, bevel = 0 } = {}) {
    const shape = record(A.cylinder(cx, cy, r, z0, z1 - z0, { name, owner }));
    return put(name, [cx, cy, (z0 + z1) / 2], S(k.cylinder(cx, cy, r, z0, z1 - z0, P, steps, bevel), { tone: 'mid', ...style, inner }) + extra, [shape], { bias, part });
  }
  // a prism of any polygon along a frame, drawn and recorded
  function prism(name, F, ring, s0, s1, style = {}, { bias = 0, part, owner, inner = '', extra = '', ref } = {}) {
    const shape = record(A.prism(F, ring, s0, s1, { name, owner }));
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const mid = ref ?? G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
    return put(name, mid, S(prismAny(F, ring, s0, s1), { tone: 'mid', ...style, inner }) + extra, [shape], { bias, part });
  }
  // a round boss on a round housing: a saddle pad that follows the housing, then the boss
  function boss(name, axisPoint, deg, hostR, hosts, r1, rad, owner, style = { tone: 'mid' }) {
    const F = G.frameAlong(axisPoint, radial(deg));
    const face = hostR + 0.8;
    const low = Math.sqrt(hostR * hostR - rad * rad);
    put(`${name}.pad`, G.pointOf(F, (low + face) / 2, 0, 0), S(G.saddleOf(F, rad, hostR, face, P), style), [record(A.disc(F, low - 0.05, face, rad, { name: `${name}.pad`, owner, seated: true, cut: hosts }))]);
    turned(name, F, [[face, rad], [r1, rad]], style, { owner, steps: 6 });
    return G.pointOf(F, r1, 0, 0);
  }
  const screws = (plan, inset, z, ring = 1.6, size = 0.45) => {
    const pts = k.corners(plan, inset);
    return Ln(pts.map(([x, y]) => k.ring(x, y, ring, z, P, 14)).join(''), { tone: 'lo' }) + Dots(pts.map(([x, y]) => at([x, y, z])), { size });
  };

  // a hose with a nut at each end
  const HOSES = [];
  function hose(name, points, r, { bend, nuts = [true, true], tone = 'mid', rings, seats = [null, null] } = {}) {
    const route = G.fillet(points, Math.max(bend ?? r * 2.8, 3), 10, { P, tube: r });
    const total = G.pathLength(route);
    const NUT = Math.max(2.4, r * 1.6);
    const gaps = [...(nuts[0] ? [[0, NUT]] : []), ...(nuts[1] ? [[total - NUT, total]] : [])];
    R.route(name, route, r, { gaps, rims: nuts.map((on) => (on ? r * 1.7 : r)), piece: 'bench' });
    HOSES.push(name);
    tubePieces(route, r, P, { maxLength: 12, spacing: Math.max(0.8, Math.min(1.6, r)), gaps, ...(rings ? { rings } : {}) }).forEach((piece, index) =>
      put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { route: name, chunk: index }),
    );
    [0, 1].forEach((index) => {
      if (!nuts[index]) return;
      const end = index ? route[route.length - 1] : route[0];
      const tangent = G.tangentAlong(route, index ? total : 0);
      const F = G.frameAlong(end, tangent);
      const [s0, s1] = index ? [-NUT, 0] : [0, NUT];
      const seat = seats[index] ? { seated: true, cut: [seats[index]] } : {};
      const shape = record(A.disc(F, s0, s1, r * 1.7, { name: `${name}.nut${index}`, owner: name, ...seat }));
      put(`${name}.nut${index}`, G.add3(end, G.mul3(tangent, (s0 + s1) / 2)), S(G.disc(s0, s1, r * 1.7, F, P, { steps: 6, bevel: 0.2 }), { tone: 'mid' }), [shape], { bias: 0.1 });
    });
    return route;
  }

  // a face-up dial gauge: body, knurled bezel, ticks; the needle is a live part
  function dial(name, [cx, cy], r, z0, z1, { from = -0.75 * Math.PI, span = 1.5 * Math.PI, count = 20, every = 5, needle, value = 0, bias = 0, owner } = {}) {
    const top = z1;
    const ticks = k.radialTicks(cx, cy, r - 1.4, count, every, top, [0.8, 1.7], P, from, span);
    const angle = from + value * span;
    const sx = Math.sin(angle);
    const sy = -Math.cos(angle);
    const nd = k.lineOnTop([cx - sx * 1.2, cy - sy * 1.2], [cx + sx * (r - 2.2), cy + sy * (r - 2.2)], top + 0.2, P);
    const extra =
      Ln(k.knurl(cx, cy, r, top - 1.4, top, Math.round(r * 5), P, 0.3), { tone: 'lo' }) +
      Ln(k.ring(cx, cy, r - 1.0, top, P, 56), { tone: 'lo' }) +
      Ln(ticks.minor, { tone: 'lo' }) +
      Ln(ticks.major, { tone: 'mid' }) +
      `<path data-part="${needle}" class="iso-line" data-tone="hi" data-free="start" d="${nd}" style="stroke-width:1"/>` +
      Dots([at([cx, cy, top + 0.2])], { size: 0.55, tone: 'hi' });
    return cyl(name, cx, cy, r, z0, z1, { tone: 'hi', crease: 'lo' }, { bias, extra, steps: 56, bevel: 0.4, owner });
  }

  // the static base: halo, feet, plate with a seam, a groove, corner screws and a label plate
  function base(PLATE, { height = 8, foot = 4, footR = 5, label } = {}) {
    const back = [];
    back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -height - foot, height, P)}"/>`);
    for (const [x, y] of [...k.corners(PLATE, footR + 6)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))) {
      back.push(S(k.cylinder(x, y, footR, -height - foot, 1.2, P, 28), { tone: 'lo' }));
      back.push(S(k.cylinder(x, y, footR - 1.3, -height - foot + 1.2, foot - 1.2, P, 28), { tone: 'mid' }));
    }
    back.push(S(k.slabOf(PLATE, -height, height, P, 8, 1.2), { tone: 'mid', inner: Ln(k.sideSeam(PLATE, -height + 3, P, 8), { tone: 'faint' }) }));
    back.push(Ln(k.planOutline(k.insetPlan(PLATE, 4), 0, P), { tone: 'lo' }));
    back.push(screws(PLATE, 8, 0, 1.8, 0.45));
    record(A.slab(PLATE, -height, height, { name: 'base.plate', ground: true }, 8));
    if (label) {
      back.push(S(k.slabOf(label, 0, 0.6, P, 4), { tone: 'lo', crease: 'none' }));
      back.push(Ln(k.planOutline(k.insetPlan(label, 1.2), 0.6, P, 4), { tone: 'faint' }));
      const rows = [[0.3, 0.62], [0.52, 0.46], [0.74, 0.55]];
      rows.forEach(([v, len]) => back.push(Ln(k.lineOnTop([label.x + 3.5, label.y + label.d * v], [label.x + 3.5 + (label.w - 7) * len, label.y + label.d * v], 0.6, P), { tone: 'lo', free: true })));
      back.push(Dots([at([label.x + 1.8, label.y + label.d / 2, 0.6]), at([label.x + label.w - 1.8, label.y + label.d / 2, 0.6])], { size: 0.4 }));
    }
    return back;
  }

  // settle, sort and wrap everything as one CSP-safe svg string
  // settle, sort and wrap everything as one CSP-safe svg string, cropped to the points in `bounds`
  function finish({ width, height, label, back = [], className, bounds = [], pad = 10 }) {
    A.settle(R, P);
    R.items.sort((a, b) => a.key - b.key);
    const groups = R.items.map((item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`);
    const svg = cspSafe(k.figureSvg({ width, height, label, body: [...back, ...groups], className }));
    if (!bounds.length) return svg;
    const xy = bounds.map(at);
    const x0 = Math.min(...xy.map((p) => p[0])) - pad;
    const y0 = Math.min(...xy.map((p) => p[1])) - pad;
    const w = Math.max(...xy.map((p) => p[0])) + pad - x0;
    const h = Math.max(...xy.map((p) => p[1])) + pad * 1.6 - y0;
    return svg.replace(`viewBox="0 0 ${width} ${height}"`, `viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"`);
  }

  return { P, V, KS, R, record, at, S, Ln, Dots, path3, prismAny, put, cutZ, turned, box, cyl, prism, boss, screws, hose, dial, base, finish, HOSES };
}

export function auditOrExit(R, P) {
  A.auditOrExit(R, P, {});
}
