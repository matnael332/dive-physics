// The diver's shape, in metres. Pure data and maths, no rendering.
//
// Frame: the diver lies horizontally (trim position), head toward +X,
// back toward +Y (up), belly toward -Y. The diver's right side is +Z, left side is -Z.
// The pelvis joint is the origin.

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const JOINTS = {
  pelvis: [0, 0, 0],
  spine: [0.13, 0.01, 0],
  chest: [0.3, 0.02, 0],
  neck: [0.52, 0.045, 0],
  head: [0.61, 0.07, 0],
  upperArm_L: [0.47, 0.03, -0.18],
  foreArm_L: [0.35, -0.19, -0.29],
  hand_L: [0.58, -0.25, -0.17],
  upperArm_R: [0.47, 0.03, 0.18],
  foreArm_R: [0.4, -0.2, 0.28],
  hand_R: [0.63, -0.265, 0.13],
  thigh_L: [-0.02, -0.03, -0.095],
  shin_L: [-0.44, -0.05, -0.16],
  foot_L: [-0.66, 0.28, -0.19],
  thigh_R: [-0.02, -0.03, 0.095],
  shin_R: [-0.44, -0.05, 0.16],
  foot_R: [-0.66, 0.28, 0.19],
};

export const PARENT = {
  pelvis: null,
  spine: 'pelvis',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  upperArm_L: 'chest',
  foreArm_L: 'upperArm_L',
  hand_L: 'foreArm_L',
  upperArm_R: 'chest',
  foreArm_R: 'upperArm_R',
  hand_R: 'foreArm_R',
  thigh_L: 'pelvis',
  shin_L: 'thigh_L',
  foot_L: 'shin_L',
  thigh_R: 'pelvis',
  shin_R: 'thigh_R',
  foot_R: 'shin_R',
};

export const BONES = Object.keys(JOINTS);

export const TOES = { L: [-0.88, 0.335, -0.22], R: [-0.88, 0.335, 0.22] };

// Head frame: U points to the crown, F out of the face, S to the diver's left.
// The head is lifted so the diver looks ahead and slightly down.
export const HEAD = (() => {
  const U = norm([0.86, 0.5, 0]);
  const F = norm([0.5, -0.86, 0]);
  const S = cross(U, F); // diver's left (-Z)
  const C = [0.665, 0.085, 0];
  return { C, U, F, S };
})();

// Point in head coordinates (s: to the left, u: up to crown, f: forward out of the face).
export function headPoint(s, u, f) {
  const { C, U, F, S } = HEAD;
  return add(add(add(C, S, s), U, u), F, f);
}

function basisFromAxes(a, b, c) {
  return [...a, ...b, ...c];
}

function handFrame(elbow, wrist) {
  const d = norm(sub(wrist, elbow));
  const side = norm(cross(d, [0, 1, 0]));
  const up = norm(cross(side, d));
  return { d, side, up };
}

export function bodyPrims() {
  const P = [];
  const E = (bone, c, r, basis, k) => P.push({ type: 'ellipsoid', bone, c, r, basis: basis || null, k });
  const T = (bone, a, b, ra, rb, k) => P.push({ type: 'taper', bone, a, b, ra, rb, k });
  const { U, F, S } = HEAD;
  const headBasis = basisFromAxes(U, F, S);

  E('pelvis', [0.02, -0.005, 0], [0.115, 0.105, 0.162], null, 0.05);
  E('pelvis', [-0.03, 0.05, -0.065], [0.085, 0.07, 0.08], null, 0.05);
  E('pelvis', [-0.03, 0.05, 0.065], [0.085, 0.07, 0.08], null, 0.05);
  E('spine', [0.17, 0.0, 0], [0.12, 0.1, 0.145], null, 0.06);
  E('chest', [0.34, 0.02, 0], [0.15, 0.125, 0.172], null, 0.06);
  T('chest', [0.46, 0.035, -0.15], [0.46, 0.035, 0.15], 0.07, 0.07, 0.05);
  T('neck', [0.49, 0.04, 0], [0.62, 0.068, 0], 0.062, 0.055, 0.04);
  E('head', HEAD.C, [0.122, 0.106, 0.093], headBasis, 0.03);
  E('head', headPoint(0, -0.06, 0.05), [0.055, 0.06, 0.068], headBasis, 0.035);

  for (const side of ['L', 'R']) {
    const sh = JOINTS['upperArm_' + side], el = JOINTS['foreArm_' + side], wr = JOINTS['hand_' + side];
    T('upperArm_' + side, sh, el, 0.056, 0.044, 0.035);
    T('foreArm_' + side, el, wr, 0.046, 0.033, 0.025);
    const hf = handFrame(el, wr);
    const hb = 'hand_' + side;
    // Gloved hand: palm, four slightly curled fingers and a thumb toward the body midline.
    E(hb, add(wr, hf.d, 0.047), [0.052, 0.021, 0.042], basisFromAxes(hf.d, hf.up, hf.side), 0.018);
    for (let f = 0; f < 4; f++) {
      const base = add(add(wr, hf.d, 0.085), hf.side, -0.023 + f * 0.0153);
      const len = [0.05, 0.058, 0.056, 0.046][f];
      const mid = add(add(base, hf.d, len * 0.55), hf.up, -0.008);
      const tip = add(add(mid, hf.d, len * 0.35), hf.up, -0.022);
      T(hb, base, mid, 0.0102, 0.0095, 0.008);
      T(hb, mid, tip, 0.0095, 0.0082, 0.006);
    }
    const thumbSide = side === 'L' ? 1 : -1;
    const tb = add(add(add(wr, hf.d, 0.03), hf.side, thumbSide * 0.03), hf.up, -0.01);
    const tt = add(add(add(tb, hf.d, 0.04), hf.side, thumbSide * 0.022), hf.up, -0.02);
    T(hb, tb, tt, 0.012, 0.0095, 0.012);

    const hip = JOINTS['thigh_' + side], knee = JOINTS['shin_' + side], ankle = JOINTS['foot_' + side];
    T('thigh_' + side, hip, knee, 0.088, 0.058, 0.05);
    T('shin_' + side, knee, ankle, 0.058, 0.04, 0.03);
    T('foot_' + side, ankle, TOES[side], 0.045, 0.034, 0.025);
  }
  return P;
}

// Torso used for the BCD jacket (abdomen, chest, shoulders).
export function torsoPrims() {
  return bodyPrims().filter((p) => p.bone === 'spine' || p.bone === 'chest');
}

// Air spaces inside the body, shown in the X-ray view.
export function lungPrims() {
  const P = [];
  const E = (c, r, k) => P.push({ type: 'ellipsoid', bone: 'chest', c, r, basis: null, k });
  const T = (a, b, ra, rb, k) => P.push({ type: 'taper', bone: 'chest', a, b, ra, rb, k });
  for (const z of [-0.072, 0.072]) {
    E([0.35, 0.03, z], [0.13, 0.085, 0.062], 0.03);
    E([0.46, 0.04, z * 0.85], [0.055, 0.05, 0.045], 0.04);
    E([0.27, 0.0, z * 1.1], [0.06, 0.065, 0.05], 0.04);
  }
  T([0.45, 0.035, 0], [0.6, 0.06, 0], 0.012, 0.011, 0.01);
  T([0.45, 0.035, 0], [0.41, 0.035, -0.05], 0.009, 0.008, 0.01);
  T([0.45, 0.035, 0], [0.41, 0.035, 0.05], 0.009, 0.008, 0.01);
  return P;
}

// Small air spaces in the head: centre in head coordinates and radii (s, u, f).
export const HEAD_AIR = [
  { id: 'sinusFrontal', s: -0.018, u: 0.06, f: 0.072, r: [0.014, 0.011, 0.01] },
  { id: 'sinusFrontal', s: 0.018, u: 0.06, f: 0.072, r: [0.014, 0.011, 0.01] },
  { id: 'sinusMaxillary', s: -0.034, u: -0.012, f: 0.062, r: [0.016, 0.02, 0.016] },
  { id: 'sinusMaxillary', s: 0.034, u: -0.012, f: 0.062, r: [0.016, 0.02, 0.016] },
  { id: 'middleEar', s: -0.058, u: -0.004, f: 0.0, r: [0.008, 0.01, 0.009] },
  { id: 'middleEar', s: 0.058, u: -0.004, f: 0.0, r: [0.008, 0.01, 0.009] },
];

// Colour of the wetsuit surface at a vertex (linear RGB), from the dominant bone and normal.
export function suitColor(bone, p, n) {
  const black = [0.006, 0.0065, 0.008];
  const accent = [0.015, 0.075, 0.24];
  const pad = [0.03, 0.031, 0.034];
  const glove = [0.007, 0.0075, 0.009];
  if (bone.startsWith('hand') || bone.startsWith('foot')) return glove;
  const side = bone.endsWith('_L') ? -1 : bone.endsWith('_R') ? 1 : 0;
  if (bone.startsWith('thigh') && n[2] * side > 0.95) return accent;
  if (bone.startsWith('upperArm') && n[2] * side > 0.96) return accent;
  if (bone.startsWith('shin')) {
    const k = JOINTS['shin_' + bone.slice(-1)];
    const dk = Math.hypot(p[0] - k[0], p[1] - k[1], p[2] - k[2]);
    if (dk < 0.075 && n[1] < -0.2) return pad;
  }
  if (bone === 'head' || bone === 'neck') {
    const { C, U, F, S } = HEAD;
    const d = sub(p, C);
    const s = d[0] * S[0] + d[1] * S[1] + d[2] * S[2];
    const u = d[0] * U[0] + d[1] * U[1] + d[2] * U[2];
    const f = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];
    // Face opening of the hood: an oval on the front of the head.
    const oval = (s / 0.05) ** 2 + ((u + 0.01) / 0.075) ** 2;
    if (f > 0.045 && oval < 1) return [0.5, 0.29, 0.19];
  }
  return black;
}

export { norm, cross, add, sub };
