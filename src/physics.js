// Diving physics used by the story. Every number is an approximation for learning.

export const G = 9.81; // m/s²
export const RHO = 1025; // sea water, kg/m³
export const KG_PER_LITRE = RHO / 1000; // lift of one litre of displaced sea water
export const METRES_PER_BAR = 10; // teaching approximation: every 10 m of sea water adds about 1 bar

// Absolute pressure in bar: 1 bar of air at the surface plus 1 bar per 10 m of water.
export function pressureAt(depth) {
  return 1 + Math.max(0, depth) / METRES_PER_BAR;
}

// Boyle's law at constant temperature: P1 × V1 = P2 × V2.
export function boyleVolume(v1, p1, p2) {
  return (v1 * p1) / p2;
}

// Volume at `depth` of a closed, flexible air space that held `surfaceVolume` at the surface.
export function volumeAtDepth(surfaceVolume, depth) {
  return boyleVolume(surfaceVolume, 1, pressureAt(depth));
}

// The diver used in the story (illustrative values, not a buoyancy calculator).
export const DIVER = {
  surfaceNetKg: 0, // net buoyancy at the surface with an empty BCD and a normal breath: about neutral
  suitLitres: 6, // gas trapped in a 7 mm wetsuit at the surface
  dragArea: { horizontal: 0.75, vertical: 0.11 }, // drag coefficient × frontal area, m²
};

// Net buoyancy in kg (positive = floats up, negative = sinks).
// bcdLitres is the gas volume in the BCD at this depth; lungDelta is litres above or below a normal breath.
export function netBuoyancy({ depth, bcdLitres = 0, lungDelta = 0 }, diver = DIVER) {
  const suit = volumeAtDepth(diver.suitLitres, depth);
  return diver.surfaceNetKg + KG_PER_LITRE * (suit - diver.suitLitres + bcdLitres + lungDelta);
}

// Speed where drag balances the net force. Positive = upward, m/s.
export function terminalSpeed(netKg, dragArea) {
  const f = netKg * G;
  return Math.sign(f) * Math.sqrt((2 * Math.abs(f)) / (RHO * dragArea));
}

// Net buoyancy needed to move vertically at `speed` (m/s, + up) against drag.
export function netForSpeed(speed, dragArea) {
  return (Math.sign(speed) * 0.5 * RHO * dragArea * speed * speed) / G;
}

// BCD gas volume at `depth` that gives the wanted net buoyancy.
export function bcdForNet(targetKg, depth, lungDelta = 0, diver = DIVER) {
  const withoutBcd = netBuoyancy({ depth, bcdLitres: 0, lungDelta }, diver);
  return Math.max(0, (targetKg - withoutBcd) / KG_PER_LITRE);
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Simulates the dive told by the story: float at the surface, vent and exhale,
 * a horizontal descent that starts slowly and speeds up, a controlled descent to 30 m,
 * a short stay, a slow ascent, a safety stop and the surface.
 * Returns samples every `dt` seconds and the times of key moments.
 */
export function simulateDive({ dt = 0.05, diver = DIVER } = {}) {
  const A = diver.dragArea.horizontal;
  const samples = [];
  const marks = {};
  let t = 0, depth = 0, v = 0;
  let bcdSL = 5; // gas in the BCD, measured in surface litres
  let phase = 'surface';
  const tau = 1.5; // seconds for the speed to settle
  const record = (lung, netKg) => {
    samples.push({
      t, depth, v, phase, net: netKg, lungDelta: lung,
      bcdSL, bcdLitres: bcdSL / pressureAt(depth), suitLitres: volumeAtDepth(diver.suitLitres, depth),
    });
  };
  const markDepth = (name, d) => {
    if (marks[name] === undefined && depth >= d) marks[name] = t;
  };
  const step = (lung, controller) => {
    if (controller) bcdSL = controller();
    const net = netBuoyancy({ depth, bcdLitres: bcdSL / pressureAt(depth), lungDelta: lung }, diver);
    const target = terminalSpeed(net, A);
    v += (target - v) * Math.min(1, dt / tau);
    depth = Math.max(0, depth - v * dt);
    if (depth === 0 && v > 0) v = 0;
    record(lung, net);
    t += dt;
  };

  // 1. Floating at the surface with some air in the BCD.
  marks.start = 0;
  while (t < 6) step(0);
  // 2. Vent the BCD and exhale; the diver slowly starts to sink.
  marks.vent = t;
  phase = 'vent';
  const t0 = t;
  while (depth < 0.4 || t < t0 + 6) {
    const k = t - t0;
    bcdSL = 5 * (1 - smooth(0, 4, k));
    const lung = -1.2 * smooth(3, 5, k);
    step(lung);
    if (marks.sinking === undefined && v < -0.01) marks.sinking = t;
    if (t > 120) break;
  }
  // 3. Free sinking: the suit is squeezed, buoyancy drops, the descent speeds up.
  phase = 'sinking';
  while (depth < 9) {
    step(-1.0);
    markDepth('d2', 2);
    markDepth('d5', 5);
  }
  // 4. Add air to the BCD in short bursts to slow down.
  phase = 'neutralize';
  marks.neutralize = t;
  const tN = t;
  while (t < tN + 8) {
    const k = t - tN;
    const lung = -1.0 + smooth(0, 6, k);
    const want = bcdForNet(-0.7, depth, lung, diver) * pressureAt(depth);
    step(lung, () => bcdSL + (want - bcdSL) * Math.min(1, dt / 2.0));
    markDepth('d10', 10);
  }
  // 5. Controlled descent to 30 m.
  phase = 'descent';
  while (depth < 30) {
    step(0, () => bcdForNet(-0.7, depth, 0, diver) * pressureAt(depth));
    markDepth('d10', 10);
    markDepth('d20', 20);
    if (t > 2000) break;
  }
  depth = 30;
  v = 0;
  samples[samples.length - 1].depth = Math.min(samples[samples.length - 1].depth, 30);
  marks.d30 = t;
  // 6. Neutral at 30 m.
  phase = 'bottom';
  const tB = t;
  while (t < tB + 30) step(0, () => bcdForNet(0, depth, 0, diver) * pressureAt(depth));
  marks.ascent = t;
  // 7. Slow ascent (9 m/min) to 5 m, venting the BCD as the air expands.
  phase = 'ascent';
  const up = 0.15;
  const holdSL = bcdSL;
  marks.bcdAt30 = holdSL;
  while (depth > 5) {
    bcdSL = bcdForNet(netForSpeed(up, A), depth, 0, diver) * pressureAt(depth);
    v = up;
    depth = Math.max(5, depth - up * dt);
    record(0, netBuoyancy({ depth, bcdLitres: bcdSL / pressureAt(depth) }, diver));
    if (marks.d20up === undefined && depth <= 20) marks.d20up = t;
    if (marks.d10up === undefined && depth <= 10) marks.d10up = t;
    t += dt;
  }
  // 8. Safety stop at 5 m (shortened in the story; the usual stop is 3 minutes).
  phase = 'stop';
  marks.stop = t;
  const tS = t;
  v = 0;
  while (t < tS + 20) {
    bcdSL = bcdForNet(0, depth, 0, diver) * pressureAt(depth);
    record(0, 0);
    t += dt;
  }
  // 9. Final slow ascent and inflating the BCD at the surface.
  phase = 'final';
  marks.final = t;
  while (depth > 0) {
    bcdSL = bcdForNet(netForSpeed(0.1, A), depth, 0, diver) * pressureAt(depth);
    v = 0.1;
    depth = Math.max(0, depth - 0.1 * dt);
    record(0, netBuoyancy({ depth, bcdLitres: bcdSL / pressureAt(depth) }, diver));
    t += dt;
  }
  marks.surface = t;
  phase = 'surfaced';
  v = 0;
  const tE = t;
  const sl = bcdSL;
  while (t < tE + 6) {
    bcdSL = sl + (5 - sl) * smooth(0, 4, t - tE);
    record(0, netBuoyancy({ depth: 0, bcdLitres: bcdSL }, diver));
    t += dt;
  }
  marks.end = t;
  return { samples, marks, dt };
}

// Linear interpolation of a sample at time t.
export function sampleAt(profile, t) {
  const { samples, dt } = profile;
  const x = Math.min(Math.max(t / dt, 0), samples.length - 1);
  const i = Math.floor(x);
  const a = samples[i], b = samples[Math.min(i + 1, samples.length - 1)];
  const f = x - i;
  const out = { phase: f < 0.5 ? a.phase : b.phase };
  for (const k of Object.keys(a)) if (typeof a[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}
