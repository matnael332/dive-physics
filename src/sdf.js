// Signed distance primitives and a blended field builder.
// Pure JavaScript with no dependencies, so it runs in the browser and in Node tests.

function len3(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

// Polynomial smooth minimum: blends two distances over a band of width k.
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Ellipsoid centred at the origin (approximate distance, exact sign).
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = len3(x / rx, y / ry, z / rz);
  const k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  if (k1 < 1e-12) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

// Capsule from a to b whose radius changes linearly from ra to rb (approximate distance).
export function sdTaper(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  let t = (pax * bax + pay * bay + paz * baz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return len3(pax - bax * t, pay - bay * t, paz - baz * t) - (ra + (rb - ra) * t);
}

// Box with rounded edges centred at the origin (half sizes bx, by, bz).
export function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
  const outside = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}

// Local coordinates of p in a primitive frame: basis is 9 numbers (three unit axes).
function toLocal(p, c, basis, out) {
  const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
  if (!basis) {
    out[0] = dx; out[1] = dy; out[2] = dz;
  } else {
    out[0] = dx * basis[0] + dy * basis[1] + dz * basis[2];
    out[1] = dx * basis[3] + dy * basis[4] + dz * basis[5];
    out[2] = dx * basis[6] + dy * basis[7] + dz * basis[8];
  }
  return out;
}

export function evalPrimitive(prim, x, y, z, tmp = [0, 0, 0]) {
  if (prim.type === 'taper') return sdTaper(x, y, z, prim.a, prim.b, prim.ra, prim.rb);
  const l = toLocal([x, y, z], prim.c, prim.basis, tmp);
  if (prim.type === 'ellipsoid') return sdEllipsoid(l[0], l[1], l[2], prim.r[0], prim.r[1], prim.r[2]);
  if (prim.type === 'box') return sdRoundBox(l[0], l[1], l[2], prim.half[0], prim.half[1], prim.half[2], prim.round);
  throw new Error('unknown primitive ' + prim.type);
}

function primBounds(prim) {
  if (prim.type === 'taper') {
    const r = Math.max(prim.ra, prim.rb);
    return [
      Math.min(prim.a[0], prim.b[0]) - r, Math.min(prim.a[1], prim.b[1]) - r, Math.min(prim.a[2], prim.b[2]) - r,
      Math.max(prim.a[0], prim.b[0]) + r, Math.max(prim.a[1], prim.b[1]) + r, Math.max(prim.a[2], prim.b[2]) + r,
    ];
  }
  const ext = prim.type === 'ellipsoid' ? Math.max(...prim.r) : len3(prim.half[0], prim.half[1], prim.half[2]);
  return [prim.c[0] - ext, prim.c[1] - ext, prim.c[2] - ext, prim.c[0] + ext, prim.c[1] + ext, prim.c[2] + ext];
}

/**
 * Builds a field from primitives blended with smooth minimum.
 * Each primitive: { type, bone, k (blend width), ...shape }.
 * Returns distance(x,y,z), boneWeights(x,y,z) and the overall bounding box.
 */
export function makeField(prims, { margin = 0.03, boneNames = [] } = {}) {
  const n = prims.length;
  const boxes = new Float64Array(n * 6);
  const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  prims.forEach((p, i) => {
    const b = primBounds(p);
    const grow = (p.k || 0) + margin;
    for (let a = 0; a < 3; a++) {
      boxes[i * 6 + a] = b[a] - grow;
      boxes[i * 6 + 3 + a] = b[a + 3] + grow;
      bmin[a] = Math.min(bmin[a], b[a]);
      bmax[a] = Math.max(bmax[a], b[a + 3]);
    }
  });
  const boneIndex = prims.map((p) => boneNames.indexOf(p.bone));
  const tmp = [0, 0, 0];
  const far = margin + 0.05;

  function inBox(i, x, y, z) {
    const o = i * 6;
    return x >= boxes[o] && x <= boxes[o + 3] && y >= boxes[o + 1] && y <= boxes[o + 4] && z >= boxes[o + 2] && z <= boxes[o + 5];
  }

  function distance(x, y, z) {
    let d = far;
    let any = false;
    for (let i = 0; i < n; i++) {
      if (!inBox(i, x, y, z)) continue;
      const di = evalPrimitive(prims[i], x, y, z, tmp);
      d = any ? smin(d, di, prims[i].k || 0) : di;
      any = true;
    }
    return d;
  }

  // Soft weights per bone, from how close each primitive is (used for skinning).
  const dist = new Float64Array(n);
  function boneWeights(x, y, z, sharpness = 0.022) {
    let dmin = Infinity;
    for (let i = 0; i < n; i++) {
      dist[i] = inBox(i, x, y, z) ? evalPrimitive(prims[i], x, y, z, tmp) : Infinity;
      if (dist[i] < dmin) dmin = dist[i];
    }
    const w = new Map();
    for (let i = 0; i < n; i++) {
      if (dist[i] === Infinity) continue;
      const wi = Math.exp(-(dist[i] - dmin) / sharpness);
      if (wi < 1e-4) continue;
      const b = boneIndex[i];
      w.set(b, (w.get(b) || 0) + wi);
    }
    return w;
  }

  return { distance, boneWeights, bmin, bmax };
}

// Central-difference gradient of a distance function.
export function gradient(f, x, y, z, e, out = [0, 0, 0]) {
  out[0] = f(x + e, y, z) - f(x - e, y, z);
  out[1] = f(x, y + e, z) - f(x, y - e, z);
  out[2] = f(x, y, z + e) - f(x, y, z - e);
  const l = len3(out[0], out[1], out[2]) || 1;
  out[0] /= l; out[1] /= l; out[2] /= l;
  return out;
}
