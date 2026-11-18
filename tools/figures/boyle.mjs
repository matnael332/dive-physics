// Figure: a water-filled pressure test pot, cut in half, with the 17 L balloon inside.
// A floor pump raises the pressure on the way down, a bleed valve lets it out on the way up,
// the dial reads the depth the pot stands for, and a height gauge resting on the balloon
// reads its size against marks for 1, 1/2, 1/3, 1/4 and 1/5 of the surface volume.
import { k, G, A, bench, halfRing, radial } from './parts.mjs';
import { balloonScale } from '../../src/physics.js';

export const W = 400;
export const H = 268;

// world (units are arbitrary, about one pixel at full size)
const PX = -14;
const PY = 0; // cut plane: the half y < PY is kept
const PLATE = { x: -60, y: -44, w: 122, d: 64, r: 6 };
const POT = { plinth: [0, 3, 35], bottom: [3, 7, 33], wall: [7, 66], rIn: 29, rOut: 33, flange: [66, 71, 38], lid: [71, 75, 38] };
const BALLOON = { r0: 17, knot: 16, neck: 3, y: PY - 2 };
const TOP0 = BALLOON.knot + BALLOON.neck + 2 * BALLOON.r0; // balloon top at 1 bar
const BAR = { x: PX + 20, y: PY - 4, w: 4, d: 4, r: 0.4 };
const BAR_Z = [9, 60];
const DIAL = { c: [PX - 13, PY - 17], r: 9, z: [78, 82] };
const BLEED = { c: [PX + 15, PY - 18], z: 81.6, len: 8.5, w: 1.6, h: 1 };
const PUMP = { c: [47, -12], r: 5, z: [2, 34] };
const PUMP_ROD = { r: 1.1, z: [36, 44] };

export function build() {
  const BOUNDS = [
    ...k.boxCorners(PLATE, -12, 0),
    [PX - 38, PY - 38, 76],
    [PX + 38, PY - 38, 76],
    [PX - 38, PY, 76],
    [DIAL.c[0] - DIAL.r, DIAL.c[1] - DIAL.r, DIAL.z[1] + 1],
    [PUMP.c[0], PUMP.c[1] - 9, 48],
    [PUMP.c[0], PUMP.c[1] + 9, 48],
  ];
  const P = k.fitProjection(
    BOUNDS,
    W,
    H,
    { pad: 8, azimuth: 56, elevation: 28 },
  );
  const B = bench(P);
  const { at, S, Ln, Dots, path3, put, cutZ, turned, box, cyl, prism, boss, screws, hose, dial, record } = B;

  const back = B.base(PLATE, { label: { x: -54, y: 5, w: 22, d: 11, r: 1.2 } });
  // a ruler strip along the front edge, ticks hanging from its back edge
  {
    const strip = { x: -26, y: 12, w: 78, d: 5, r: 0.8 };
    back.push(S(k.slabOf(strip, 0, 0.5, P, 3), { tone: 'lo', crease: 'none' }));
    const t = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 3, 5, strip.y + 0.5, 0.5, [1.4, 2.6], P);
    back.push(Ln(t.minor, { tone: 'lo' }), Ln(t.major, { tone: 'mid' }));
    back.push(Dots([at([strip.x + 1.5, strip.y + 2.5, 0.5]), at([strip.x + strip.w - 1.5, strip.y + 2.5, 0.5])], { size: 0.4 }));
  }

  // ---------------------------------------------------------------- the pot, cut in half
  const own = { owner: 'pot' };
  cutZ('pot.plinth', PX, PY, [POT.plinth[0], POT.plinth[1], 0, POT.plinth[2]], { tone: 'lo' }, own);
  cutZ('pot.bottom', PX, PY, [POT.bottom[0], POT.bottom[1], 0, POT.bottom[2]], {}, own);
  // the water inside: the half cylinder of water seen through the cut
  const water = (() => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = Math.PI + (i / 40) * Math.PI;
      for (const z of [POT.wall[0], POT.flange[1]]) pts.push(at([PX + POT.rIn * Math.cos(t), PY + POT.rIn * Math.sin(t), z]));
    }
    return `<path class="fig-water" d="${k.pathOf(hull(pts), true)}"/>`;
  })();
  const wallShapes = cutZ('pot.wall', PX, PY, [POT.wall[0], POT.wall[1], POT.rIn, POT.rOut], {}, { ...own, extra: water });
  cutZ('pot.flange', PX, PY, [POT.flange[0], POT.flange[1], POT.rIn, POT.flange[2]], {}, own);
  // lid with a bolt circle on the back half
  const bolts = [];
  for (let i = 0; i < 7; i++) {
    const t = Math.PI + ((i + 0.5) / 7) * Math.PI;
    bolts.push([PX + 35 * Math.cos(t), PY + 35 * Math.sin(t)]);
  }
  cutZ('pot.lid', PX, PY, [POT.lid[0], POT.lid[1], 0, POT.lid[2]], {}, {
    ...own,
    extra: Ln(bolts.map(([x, y]) => k.ring(x, y, 1.5, POT.lid[1], P, 14)).join(''), { tone: 'lo' }) + Dots(bolts.map(([x, y]) => at([x, y, POT.lid[1]])), { size: 0.45 }),
  });
  // ---------------------------------------------------------------- dial and bleed valve on the lid
  cyl('dial.stem', DIAL.c[0], DIAL.c[1], 1.6, POT.lid[1], DIAL.z[0], { tone: 'mid' }, { steps: 6 });
  dial('dial', DIAL.c, DIAL.r, DIAL.z[0], DIAL.z[1], { needle: 'needle', count: 20, every: 5, value: 0 });
  cyl('bleed.body', BLEED.c[0], BLEED.c[1], 2.6, POT.lid[1], 80, { tone: 'mid' }, { steps: 6 });
  turned('bleed.spout', G.frameAlong([BLEED.c[0], BLEED.c[1], 77.5], [1, 0, 0]), [[2.2, 0.9], [5, 0.9]], { tone: 'mid' }, { steps: 12 });
  cyl('bleed.stem', BLEED.c[0], BLEED.c[1], 0.8, 80, BLEED.z, { tone: 'hi' }, { steps: 12 });
  const leverF = G.frameOf([BLEED.c[0], BLEED.c[1], 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  put('bleed.lever', [BLEED.c[0], BLEED.c[1], BLEED.z], `<g data-part="bleed">${S(B.prismAny(leverF, leverRing(0), BLEED.z, BLEED.z + BLEED.h), { tone: 'mid' })}</g>`, [record(A.prism(leverF, leverRing(0), BLEED.z, BLEED.z + BLEED.h, { name: 'bleed.lever' }))]);

  // ---------------------------------------------------------------- balloon on its tether
  const K = [PX, BALLOON.y, BALLOON.knot];
  cyl('anchor.weight', PX, BALLOON.y, 5, POT.bottom[1], POT.bottom[1] + 2.5, { tone: 'lo' }, { steps: 40, bevel: 0.4 });
  cyl('anchor.eye', PX, BALLOON.y, 1, POT.bottom[1] + 2.5, POT.bottom[1] + 3.5, { tone: 'mid' }, { steps: 16 });
  cyl('tether', PX, BALLOON.y, 0.35, POT.bottom[1] + 3.5, BALLOON.knot - 0.6, { tone: 'mid', crease: 'none' }, { steps: 10 });
  const centre = [PX, BALLOON.y, BALLOON.knot + BALLOON.neck + BALLOON.r0];
  const NF = G.frameAlong(K, [0, 0, 1]);
  const neck = [[-0.6, 0], [-0.6, 1.3], [0.6, 1.3], [0.6, 0.7], [BALLOON.neck + 0.4, 1.7], [BALLOON.neck + 0.4, 0]];
  const balloonSvg =
    S(G.solidOf(neck, NF, P, { steps: 24 }), { tone: 'hi', lit: true, className: 'fig-balloon' }) +
    S(G.sphereOf(centre, BALLOON.r0, P, { steps: 64 }), { tone: 'hi', lit: true, className: 'fig-balloon' });
  put('balloon', centre, `<g data-part="balloon">${balloonSvg}</g>`, [record(A.solid(NF, neck, { name: 'balloon.neck', owner: 'balloon' })), record(A.ball(centre, BALLOON.r0, { name: 'balloon', owner: 'balloon' }))]);

  // ---------------------------------------------------------------- height gauge resting on the balloon
  const foot = { x: BAR.x - 4, y: BAR.y - 4, w: 12, d: 10, r: 1 };
  box('gauge.foot', foot, POT.bottom[1], BAR_Z[0], { tone: 'mid' }, { steps: 2, extra: screws(foot, 2, BAR_Z[0], 1, 0.35) });
  const marks = [1, 2, 3, 4, 5].map((p) => topAt(p));
  const minor = [1.5, 2.5, 3.5, 4.5].map((p) => topAt(p));
  const face = BAR.y + BAR.d; // front face of the bar
  const tick = (z, len) => path3([[BAR.x + BAR.w, face, z], [BAR.x + BAR.w - len, face, z]]);
  box('gauge.bar', BAR, BAR_Z[0], BAR_Z[1], { tone: 'mid' }, {
    steps: 2,
    bevel: 0.2,
    inner: Ln(marks.map((z) => tick(z, 2.6)).join(''), { tone: 'hi', free: 'end' }) + Ln(minor.map((z) => tick(z, 1.4)).join(''), { tone: 'lo', free: 'end' }),
  });
  cyl('gauge.cap', BAR.x + BAR.w / 2, BAR.y + BAR.d / 2, 2.6, BAR_Z[1], BAR_Z[1] + 1.4, { tone: 'mid' }, { steps: 24, bevel: 0.3 });
  // the sliding arm: carriage on the bar, arm across, pad on the balloon top
  const armZ = TOP0 + 1.2;
  const carriage = { x: BAR.x - 2.6, y: BAR.y - 0.5, w: 2.6, d: 5, r: 0.3 };
  const arm = { x: PX - 2.4, y: BALLOON.y - 1, w: carriage.x - (PX - 2.4), d: 2, r: 0.3 };
  const armParts =
    S(k.slabOf(carriage, armZ - 3.4, 6.8, P, 2, 0.3), { tone: 'hi', inner: Ln(path3([[carriage.x, carriage.y + carriage.d, armZ + 0.8], [carriage.x + carriage.w, carriage.y + carriage.d, armZ + 0.8]]), { tone: 'lit' }) }) +
    S(k.slabOf(arm, armZ, 1.6, P, 2, 0.2), { tone: 'hi' }) +
    S(k.cylinder(PX, BALLOON.y, 1.8, TOP0, 1.2, P, 24), { tone: 'hi' });
  put('gauge.arm', [PX + 8, BALLOON.y, armZ], `<g data-part="arm">${armParts}</g>`, [
    record(A.slab(carriage, armZ - 3.4, 6.8, { name: 'gauge.carriage', owner: 'gauge.arm' }, 2)),
    record(A.slab(arm, armZ, 1.6, { name: 'gauge.armbar', owner: 'gauge.arm' }, 2)),
    record(A.cylinder(PX, BALLOON.y, 1.8, TOP0, 1.2, { name: 'gauge.pad', owner: 'gauge.arm' })),
  ]);

  // ---------------------------------------------------------------- floor pump and hose to the pot
  const pf = { x: PUMP.c[0] - 9, y: PUMP.c[1] - 11, w: 18, d: 22, r: 2 };
  box('pump.foot', pf, 0, 2, { tone: 'mid' }, { steps: 2, extra: screws(pf, 2.4, 2, 1.1, 0.4) });
  const barrel = cyl('pump.barrel', PUMP.c[0], PUMP.c[1], PUMP.r, PUMP.z[0], PUMP.z[1], { tone: 'mid' }, { steps: 48, inner: Ln(k.sideArc(PUMP.c[0], PUMP.c[1], PUMP.r, 12, P, 32) + k.sideArc(PUMP.c[0], PUMP.c[1], PUMP.r, 26, P, 32), { tone: 'faint' }) });
  cyl('pump.cap', PUMP.c[0], PUMP.c[1], PUMP.r + 0.6, PUMP.z[1], PUMP.z[1] + 2, { tone: 'mid' }, { steps: 48, bevel: 0.3 });
  const rodSvg =
    S(k.cylinder(PUMP.c[0], PUMP.c[1], PUMP_ROD.r, PUMP_ROD.z[0], PUMP_ROD.z[1] - PUMP_ROD.z[0], P, 16), { tone: 'hi' }) +
    S(k.slabOf({ x: PUMP.c[0] - 1.4, y: PUMP.c[1] - 5, w: 2.8, d: 10, r: 0.6 }, PUMP_ROD.z[1], 2.6, P, 2, 0.3), { tone: 'mid' });
  const gripF = G.frameAlong([PUMP.c[0], PUMP.c[1] - 5, PUMP_ROD.z[1] + 1.3], [0, -1, 0]);
  const gripF2 = G.frameAlong([PUMP.c[0], PUMP.c[1] + 5, PUMP_ROD.z[1] + 1.3], [0, 1, 0]);
  const grip = [[0, 1.9], [4.6, 1.9, 1], [5.2, 1.3]];
  const grips = [gripF, gripF2].map((F) => S(G.solidOf(grip, F, P, { steps: 24 }), { tone: 'mid', inner: k.fadedSvg(G.ribsOf(F, 0.6, 4.2, 1.9, 18, P, { fade: [0.1, 0.5] }), { tone: 'lo' }) })).join('');
  put('pump.handle', [PUMP.c[0], PUMP.c[1], PUMP_ROD.z[1]], `<g data-part="pump">${rodSvg + grips}</g>`, [
    record(A.cylinder(PUMP.c[0], PUMP.c[1], PUMP_ROD.r, PUMP_ROD.z[0], PUMP_ROD.z[1] - PUMP_ROD.z[0], { name: 'pump.rod', owner: 'pump.handle' })),
    record(A.slab({ x: PUMP.c[0] - 1.4, y: PUMP.c[1] - 5, w: 2.8, d: 10, r: 0.6 }, PUMP_ROD.z[1], 2.6, { name: 'pump.bar', owner: 'pump.handle' }, 2)),
    record(A.solid(gripF, grip, { name: 'pump.grip1', owner: 'pump.handle' })),
    record(A.solid(gripF2, grip, { name: 'pump.grip2', owner: 'pump.handle' })),
  ]);
  const pumpOut = boss('pump.out', [PUMP.c[0], PUMP.c[1], 7], 180, PUMP.r, barrel.shapes, PUMP.r + 3.2, 2.5, 'pump');
  const potIn = boss('pot.in', [PX, PY, 18], -24, POT.rOut, wallShapes, POT.rOut + 4, 2.4, 'pot');
  const n = radial(-24);
  hose('hose', [pumpOut, [pumpOut[0] - 5, pumpOut[1], pumpOut[2]], G.add3(potIn, G.mul3(n, 7)), potIn], 1.4, { bend: 4 });

  const svg = B.finish({
    width: W,
    height: H,
    bounds: BOUNDS,
    label: 'A pressure test pot cut in half, full of water, with a balloon tied to its floor. A floor pump raises the pressure, a dial on the lid reads it, and a height gauge resting on the balloon shows how much it has shrunk.',
    back,
  });

  function topAt(p) {
    return BALLOON.knot + (TOP0 - BALLOON.knot) * balloonScale(p);
  }
  function leverRing(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const pts = [[-1.2, -BLEED.w / 2], [BLEED.len, -BLEED.w / 2], [BLEED.len, BLEED.w / 2], [-1.2, BLEED.w / 2]];
    return pts.map(([u, v]) => [u * c - v * s, u * s + v * c]);
  }

  const data = {
    P,
    K: k.iso(K, P),
    KNOT_Z: BALLOON.knot,
    TOP0,
    DIAL: { c: [...DIAL.c, DIAL.z[1] + 0.2], r: DIAL.r - 2.2 },
    DEPTH_MAX: 40,
    BLEED,
    PUMP_STROKE: 5,
  };
  return { svg, data, R: B.R, P, HOSES: B.HOSES };
}

// convex hull of 2D points (monotone chain)
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
