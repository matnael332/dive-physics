// Figure: a teaching model of the ear, cut in half on a stand.
// The ear canal (water) ends at the eardrum; behind it the middle ear (air) holds the three small
// bones and drains through the Eustachian tube to the throat. A differential gauge on top is tapped
// into the canal and into the middle ear and reads the pressure difference across the eardrum.
import { k, G, A, bench } from './parts.mjs';

export const W = 400;
export const H = 290;

// world: the cut plane is y = 0 and the half y < 0 is kept; the drawing lives in x (across) and z (up)
const BLOCK = { x0: -44, x1: 44, z0: 12, z1: 74, r: 7, back: -24, pocket: -7 };
const PLATE = { x: -62, y: -34, w: 120, d: 44, r: 6 };
const DRUM = { x: -5.6, t: 0.8, z0: 50, z1: 60 }; // eardrum at rest: a thin membrane across the duct
const BULGE_MAX = 3.2; // drawn bulge at 0.2 bar (exaggerated)
const FLAP = { hinge: [16, 28], len: 5, t: 0.8, y: [-6, -1] };
const DIAL = { c: [-14, -1, 91], r: 10 };
const MANIFOLD = { x: -36, y: -10, w: 44, d: 10, r: 1 };
const MANIFOLD_Z = [74, 79];
const OSS = [-5, -2]; // ossicles: y range

// outlines in the cut plane (x, z)
const arc = (cx, cz, r, a0, a1, steps = 8) => Array.from({ length: steps + 1 }, (_, i) => {
  const t = a0 + ((a1 - a0) * i) / steps;
  return [cx + r * Math.cos(t), cz + r * Math.sin(t)];
});
const { x0, x1, z0, z1, r } = BLOCK;
const OUTLINE = [...arc(x0 + r, z0 + r, r, Math.PI, 1.5 * Math.PI), ...arc(x1 - r, z0 + r, r, 1.5 * Math.PI, 2 * Math.PI), ...arc(x1 - r, z1 - r, r, 0, 0.5 * Math.PI), ...arc(x0 + r, z1 - r, r, 0.5 * Math.PI, Math.PI)];
// the piece of the front layer above the air and water spaces
const TOP = [
  [x0, 66], [x0, z1 - r], ...arc(x0 + r, z1 - r, r, Math.PI, 0.5 * Math.PI).slice(1), ...arc(x1 - r, z1 - r, r, 0.5 * Math.PI, 0).slice(1), [x1, 31],
  [20, 31], [3.4, 41], [9, 41], [9, 71], [-5.2, 71], [-5.2, 60], [-34, 60],
];
// and the piece below them
const BOTTOM = [
  [x0, 44], [-34, 50], [-5.2, 50], [-5.2, 41], [-1, 41], [16, 28], [16, 20], [x1, 20], [x1, z0 + r],
  ...arc(x1 - r, z0 + r, r, 0, -0.5 * Math.PI).slice(1), ...arc(x0 + r, z0 + r, r, 1.5 * Math.PI, Math.PI).slice(1),
];
const CANAL = [[x0, 44], [-34, 50], [DRUM.x, 50], [DRUM.x, 60], [-34, 60], [x0, 66]];
const CAVITY = [[-5.2, 41], [9, 41], [9, 71], [-5.2, 71]];
const TUBE = [[-1, 41], [3.4, 41], [20, 31], [16, 28]];
const THROAT = [[16, 20], [x1, 20], [x1, 31], [16, 31]];

export function build() {
  const BOUNDS = [
    ...k.boxCorners(PLATE, -12, 0),
    [x0, BLOCK.back, z1], [x1, BLOCK.back, z1], [x0, 0, z1], [x1, 0, z1], [-58, 0, 82], [-58, -12, 82],
    [DIAL.c[0] - DIAL.r, DIAL.c[1], DIAL.c[2] + DIAL.r], [DIAL.c[0] + DIAL.r, -6, DIAL.c[2] + DIAL.r],
  ];
  const P = k.fitProjection(
    BOUNDS,
    W,
    H,
    { pad: 8, azimuth: 56, elevation: 26 },
  );
  const B = bench(P);
  const { at, S, Ln, Dots, path3, put, cyl, box, turned, boss, record, prism } = B;
  const yF = (y) => G.frameOf([0, y, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]); // prisms along y, polygons in (x, z)
  const F0 = yF(0);
  const inPlane = (poly, y) => path3(poly.map(([x, z]) => [x, y, z]), true);

  const back = B.base(PLATE, { label: { x: -56, y: -2, w: 20, d: 9, r: 1.2 } });

  // ---------------------------------------------------------------- stand
  cyl('post.low', 0, -12, 4, 0, 2.5, { tone: 'mid' }, { steps: 40, owner: 'stand' });
  cyl('post.high', 0, -12, 4, 6, 9, { tone: 'mid' }, { steps: 40, owner: 'stand' });
  const collar = cyl('post.collar', 0, -12, 5.4, 2.5, 6, { tone: 'mid' }, { steps: 40, bevel: 0.3, owner: 'stand' });
  const screwEnd = boss('post.screw', [0, -12, 4.25], 90, 5.4, collar.shapes, 5.4 + 1.6, 1.1, 'stand');
  turned('post.knob', G.frameAlong(screwEnd, [0, 1, 0]), [[0, 2.2], [2.6, 2.2, 1], [3.2, 1.6]], { tone: 'mid' }, { owner: 'stand', steps: 24, extra: k.fadedSvg(G.ribsOf(G.frameAlong(screwEnd, [0, 1, 0]), 0.4, 2.4, 2.2, 14, P, { fade: [0.1, 0.5] }), { tone: 'lo' }) });
  const mount = { x: -15, y: -21, w: 30, d: 18, r: 1 };
  box('mount', mount, 9, BLOCK.z0, { tone: 'mid' }, { steps: 2, owner: 'stand', extra: B.screws(mount, 2.2, BLOCK.z0, 1, 0.35) });

  // ---------------------------------------------------------------- the block: back slab, then the cut front layer
  const tints =
    `<path class="fig-water-deep" d="${inPlane(CANAL, BLOCK.pocket)}"/>` +
    [CAVITY, TUBE, THROAT].map((p) => `<path class="fig-air" d="${inPlane(p, BLOCK.pocket)}"/>`).join('') +
    '<g data-part="puffs"></g>';
  prism('block.back', F0, OUTLINE, BLOCK.back, BLOCK.pocket, { tone: 'mid' }, { owner: 'block', extra: tints });
  // the outer ear in section: a curved flap of cartilage from below the canal opening, up and out to the rim
  const auricle = (() => {
    const line = [[x0, 42], [-50, 43.6], [-54.4, 49], [-56, 57], [-56, 66], [-54.6, 74], [-51.2, 79.2], [-47.6, 80.8]];
    const smooth = [];
    for (let i = 0; i < line.length - 1; i++) {
      const [a, b] = [line[Math.max(0, i - 1)], line[i]];
      const [c, d] = [line[i + 1], line[Math.min(line.length - 1, i + 2)]];
      for (let j = 0; j < 6; j++) {
        const t = j / 6;
        const h = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
        smooth.push([h(a[0], b[0], c[0], d[0]), h(a[1], b[1], c[1], d[1])]);
      }
    }
    smooth.push(line[line.length - 1]);
    const off = (sign) => smooth.map((p, i) => {
      const q = smooth[Math.min(smooth.length - 1, i + 1)];
      const o = smooth[Math.max(0, i - 1)];
      const [tx, tz] = [q[0] - o[0], q[1] - o[1]];
      const len = Math.hypot(tx, tz) || 1;
      const w = 1.7 * (i === 0 ? 1 : Math.min(1, 0.55 + 0.45 * (1 - i / smooth.length) + 0.25));
      return [p[0] - (sign * tz * w) / len, p[1] + (sign * tx * w) / len];
    });
    const outer = off(-1);
    const inner = off(1);
    outer[0] = [x0, outer[0][1]];
    inner[0] = [x0, inner[0][1]];
    const tip = smooth[smooth.length - 1];
    const cap = [1, 2, 3].map((j) => {
      const [ax, az] = [outer[outer.length - 1][0] - tip[0], outer[outer.length - 1][1] - tip[1]];
      const t = (j / 4) * Math.PI;
      return [tip[0] + ax * Math.cos(t) - az * Math.sin(t), tip[1] + ax * Math.sin(t) + az * Math.cos(t)];
    });
    return [...outer, ...cap, ...inner.reverse()];
  })();
  prism('auricle', F0, auricle, -12, 0, { tone: 'mid' }, { owner: 'block', inner: `<path class="fig-cut" d="${inPlane(auricle, 0)}"/>` });
  // inlays on the cut face: tapping passages to the gauge, inner ear and mastoid air cells
  const strip = (xa, xb, za, zb, cls) => `<path class="${cls}" d="${inPlane([[xa, za], [xb, za], [xb, zb], [xa, zb]], 0)}"/>`;
  const outlineOf = (poly) => Ln(inPlane(poly, 0), { tone: 'lo' });
  const spiral = (() => {
    const outer = [];
    const inner = [];
    const turns = 2.6;
    for (let i = 0; i <= 90; i++) {
      const t = (i / 90) * turns * Math.PI * 2;
      const rr = 7 - (5.2 * i) / 90;
      const w = 0.9 - (0.35 * i) / 90;
      outer.push([21 + (rr + w) * Math.cos(t + 0.4), 52 + (rr + w) * Math.sin(t + 0.4)]);
      inner.unshift([21 + (rr - w) * Math.cos(t + 0.4), 52 + (rr - w) * Math.sin(t + 0.4)]);
    }
    return [...outer, ...inner];
  })();
  const ellipse = (cx, cz, rx, rz, steps = 18) => Array.from({ length: steps }, (_, i) => [cx + rx * Math.cos((i / steps) * 2 * Math.PI), cz + rz * Math.sin((i / steps) * 2 * Math.PI)]);
  const fluid = [spiral, ellipse(13.4, 57, 3.2, 4.2), ellipse(29, 63, 5.2, 5.2, 32), ellipse(36.5, 58.5, 1.2, 1.2, 12), ellipse(36.5, 67.5, 1.2, 1.2, 12)];
  const canalHole = ellipse(29, 63, 3.8, 3.8, 32);
  const cells = [[-38, 34, 2.4, 1.8], [-33, 37, 2, 2.2], [-28, 34.5, 2.6, 1.7], [-35, 30, 2.2, 1.6], [-30, 29.5, 1.8, 1.5], [-24, 31, 2, 1.9], [-38.5, 26, 1.6, 1.4], [-33, 25, 2, 1.5], [-26.5, 25.5, 1.6, 1.3], [-21, 36, 1.5, 1.4]];
  const topInlay =
    strip(-31, -29, 60, z1, 'fig-water-deep') + Ln(inPlane([[-31, 60], [-31, z1]], 0) + inPlane([[-29, 60], [-29, z1]], 0), { tone: 'lo' }) +
    strip(2, 4, 71, z1, 'fig-void') + strip(2, 4, 71, z1, 'fig-air') + Ln(inPlane([[2, 71], [2, z1]], 0) + inPlane([[4, 71], [4, z1]], 0), { tone: 'lo' }) +
    fluid.map((p) => `<path class="fig-fluid" d="${inPlane(p, 0)}"/>` + outlineOf(p)).join('') +
    `<path class="fig-cut" d="${inPlane(canalHole, 0)}"/>` + outlineOf(canalHole) +
    `<path class="fig-void" d="${inPlane(ellipse(9.6, 47, 0.6, 1.5, 12), 0)}"/>`;
  const bottomInlay = cells.map(([cx, cz, rx, rz]) => `<path class="fig-void" d="${inPlane(ellipse(cx, cz, rx, rz), 0)}"/><path class="fig-air" d="${inPlane(ellipse(cx, cz, rx, rz), 0)}"/>` + outlineOf(ellipse(cx, cz, rx, rz))).join('');
  const cut = (poly) => `<path class="fig-cut" d="${inPlane(poly, 0)}"/>`;
  prism('block.top', F0, TOP, BLOCK.pocket, 0, { tone: 'mid' }, { owner: 'block', inner: cut(TOP) + topInlay });
  prism('block.bottom', F0, BOTTOM, BLOCK.pocket, 0, { tone: 'mid' }, { owner: 'block', inner: cut(BOTTOM) + bottomInlay });

  // ---------------------------------------------------------------- eardrum (live), the three small bones, the tube's flap (live)
  put('drum', [DRUM.x, -3.5, 55], `<g data-part="drum">${S(B.prismAny(F0, drumRing(0), BLOCK.pocket, 0), { tone: 'hi', lit: true })}</g>`, [record(A.prism(F0, drumRing(0), BLOCK.pocket, 0, { name: 'drum', owner: 'drum' }))]);
  const oct = (cx, cz, rr) => Array.from({ length: 8 }, (_, i) => [cx + rr * Math.cos(((i + 0.5) / 8) * 2 * Math.PI), cz + rr * Math.sin(((i + 0.5) / 8) * 2 * Math.PI)]);
  const handle = [[-5.2, 53.4], [-4.0, 53.6], [-1.9, 62.6], [-3.1, 63]];
  const malleusSvg = S(B.prismAny(F0, handle, OSS[0], OSS[1]), { tone: 'hi' }) + S(B.prismAny(F0, oct(-2.6, 64.6, 2.2), OSS[0], OSS[1]), { tone: 'hi' });
  put('malleus', [-3, -3.5, 60], `<g data-part="malleus">${malleusSvg}</g>`, [
    record(A.prism(F0, handle, OSS[0], OSS[1], { name: 'malleus.handle', owner: 'drum' })),
    record(A.prism(F0, oct(-2.6, 64.6, 2.2), OSS[0], OSS[1], { name: 'malleus.head', owner: 'drum' })),
  ]);
  const incusLeg = [[0.6, 63.6], [1.8, 63.4], [3.1, 56.9], [2.1, 56.7]];
  prism('incus', F0, oct(1.2, 65.2, 2.0), OSS[0], OSS[1], { tone: 'hi' }, { owner: 'drum' });
  prism('incus.leg', F0, incusLeg, OSS[0], OSS[1], { tone: 'hi' }, { owner: 'drum' });
  const stapes = [[2.2, 55.4], [8.4, 52.8], [9, 52.8], [9, 58.2], [8.4, 58.2], [2.2, 56.6]];
  prism('stapes', F0, stapes, OSS[0], OSS[1], { tone: 'hi' }, { owner: 'drum', inner: `<path class="fig-void" d="${inPlane([[4.2, 55.6], [8, 54.2], [8, 56.8], [4.2, 56.2]], OSS[1])}"/>` });
  put('flap', [18, -3.5, 29.5], `<g data-part="flap">${S(B.prismAny(F0, flapRing(0), FLAP.y[0], FLAP.y[1]), { tone: 'hi' })}</g>`, [record(A.prism(F0, flapRing(0), FLAP.y[0], FLAP.y[1], { name: 'flap', owner: 'block' }))]);

  // ---------------------------------------------------------------- gauge: a cut manifold on top, a face-forward dial on two stems
  const mInlay =
    strip(-31, -29, MANIFOLD_Z[0], 77, 'fig-water-deep') + strip(-31, -19, 76, 77.6, 'fig-water-deep') +
    strip(2, 4, MANIFOLD_Z[0], 77, 'fig-air') + strip(-9, 4, 76, 77.6, 'fig-air');
  box('manifold', MANIFOLD, MANIFOLD_Z[0], MANIFOLD_Z[1], { tone: 'mid' }, { steps: 2, bevel: 0.3, owner: 'gauge', inner: cut([[MANIFOLD.x, MANIFOLD_Z[0]], [MANIFOLD.x + MANIFOLD.w, MANIFOLD_Z[0]], [MANIFOLD.x + MANIFOLD.w, MANIFOLD_Z[1]], [MANIFOLD.x, MANIFOLD_Z[1]]]) + mInlay });
  const [cx, , cz] = DIAL.c;
  const bottomAt = (x) => cz - Math.sqrt(DIAL.r ** 2 - (x - cx) ** 2);
  for (const sx of [-19, -9]) cyl(`gauge.stem${sx}`, sx, -4.5, 1.2, MANIFOLD_Z[1], bottomAt(sx) + 0.6, { tone: 'mid' }, { steps: 12, owner: 'gauge' });
  const DF = G.frameAlong([cx, -7.5, cz], [0, 1, 0]);
  const face = 6.1; // face plane at y = -1.4
  const yFace = -7.5 + face;
  const tick = (a, r0, r1) => path3([[cx + r0 * Math.sin(a), yFace, cz + r0 * Math.cos(a)], [cx + r1 * Math.sin(a), yFace, cz + r1 * Math.cos(a)]]);
  const minor = [];
  const major = [];
  for (let i = 0; i <= 20; i++) (i % 5 ? minor : major).push(tick(-0.75 * Math.PI + (i / 20) * 1.5 * Math.PI, DIAL.r - 2.4, i % 5 ? DIAL.r - 1.6 : DIAL.r - 1.0));
  const needle = (v) => {
    const a = -0.75 * Math.PI + v * 1.5 * Math.PI;
    return path3([[cx - 1.3 * Math.sin(a), yFace + 0.1, cz - 1.3 * Math.cos(a)], [cx + (DIAL.r - 2.6) * Math.sin(a), yFace + 0.1, cz + (DIAL.r - 2.6) * Math.cos(a)]]);
  };
  const dialExtra =
    Ln(minor.join(''), { tone: 'lo', free: 'end' }) + Ln(major.join(''), { tone: 'mid', free: 'end' }) +
    `<path data-part="needle" class="iso-line" data-tone="hi" data-free="start" d="${needle(0)}" style="stroke-width:1"/>` +
    Dots([at([cx, yFace + 0.1, cz])], { size: 0.6, tone: 'hi' });
  turned('gauge.body', DF, [[0, DIAL.r - 0.6], [0.6, DIAL.r], [face - 0.2, DIAL.r], [face, DIAL.r - 1.0], [face, 0]], { tone: 'hi', crease: 'lo' }, { owner: 'gauge', steps: 64, extra: dialExtra });

  const svg = B.finish({
    width: W,
    height: H,
    bounds: BOUNDS,
    label: 'A teaching model of the ear cut in half on a stand. Water fills the ear canal up to the eardrum. Behind it the middle ear holds air and three small bones, and the Eustachian tube runs down from it to the throat. A gauge on top is connected to the canal and to the middle ear and shows the pressure difference across the eardrum.',
    back,
  });

  function drumRing(bulge) {
    const n = 10;
    const left = [];
    const right = [];
    for (let i = 0; i <= n; i++) {
      const z = DRUM.z0 + ((DRUM.z1 - DRUM.z0) * i) / n;
      const u = (2 * (z - DRUM.z0)) / (DRUM.z1 - DRUM.z0) - 1;
      const x = DRUM.x + bulge * (1 - u * u);
      left.push([x - DRUM.t / 2, z]);
      right.unshift([x + DRUM.t / 2, z]);
    }
    return [...left, ...right];
  }
  function flapRing(angle) {
    const [hx, hz] = FLAP.hinge;
    const a = Math.atan2(31 - hz, 20 - hx) + angle;
    const [ux, uz] = [Math.cos(a), Math.sin(a)];
    const [nx, nz] = [-uz, ux];
    const t = FLAP.t;
    return [[hx, hz], [hx + ux * FLAP.len, hz + uz * FLAP.len], [hx + ux * FLAP.len - nx * t, hz + uz * FLAP.len - nz * t], [hx - nx * t, hz - nz * t]];
  }

  const data = {
    P,
    DRUM,
    BULGE_MAX,
    POCKET: BLOCK.pocket,
    OSS,
    FLAP: { ...FLAP, closed: Math.atan2(31 - FLAP.hinge[1], 20 - FLAP.hinge[0]), open: -1.0 },
    // path of the air puffs: throat, up the tube, into the middle ear (x, z at y = -3.5)
    PUFF_PATH: [[38, 25], [24, 25.5], [18.4, 30.2], [10, 35.6], [1.2, 41.2], [2.6, 47]],
    PUFF_Y: -1.2,
    DIAL: { c: [cx, yFace + 0.1, cz], r: DIAL.r - 2.6 },
    DP_MAX: 0.2,
  };
  return { svg, data, R: B.R, P };
}
