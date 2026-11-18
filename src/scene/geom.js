// Geometry helpers for gear: hoses, straps and meshes from distance fields.
import * as THREE from 'three';
import { makeField } from '../sdf.js';
import { surfaceNets } from '../surfaceNets.js';

const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);

// A hose along smooth control points. corrugation > 0 adds ribs (for the BCD inflator hose).
export function hoseGeometry(points, radius, { corrugation = 0, ribSpacing = 0.011, segments = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(v3), false, 'centripetal');
  const length = curve.getLength();
  const tubular = segments || Math.max(24, Math.round(length / (corrugation ? 0.0025 : 0.012)));
  const radial = 12;
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  if (corrugation > 0) {
    const pos = geo.attributes.position;
    const c = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      const u = i / tubular;
      curve.getPointAt(u, c);
      const k = 1 + corrugation * Math.cos(((u * length) / ribSpacing) * Math.PI * 2);
      for (let j = 0; j <= radial; j++) {
        const idx = i * (radial + 1) + j;
        p.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
        pos.setXYZ(idx, p.x, p.y, p.z);
      }
    }
    geo.computeVertexNormals();
  }
  return { geometry: geo, curve };
}

// A flat strap (rectangular cross-section) along a closed or open path.
// widthDir gives the direction of the strap's width at every point.
export function strapGeometry(points, width, thickness, widthDir, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(v3), closed, 'centripetal');
  const n = Math.max(32, points.length * 8);
  const W = v3(widthDir).normalize();
  const pos = [], idx = [];
  const t = new THREE.Vector3(), c = new THREE.Vector3(), out = new THREE.Vector3(), w = new THREE.Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const u = i / n;
    curve.getPointAt(u, c);
    curve.getTangentAt(u, t);
    w.copy(W).addScaledVector(t, -W.dot(t)).normalize();
    out.crossVectors(t, w).normalize();
    for (const [a, b] of corners) {
      pos.push(
        c.x + w.x * a * width * 0.5 + out.x * b * thickness * 0.5,
        c.y + w.y * a * width * 0.5 + out.y * b * thickness * 0.5,
        c.z + w.z * a * width * 0.5 + out.z * b * thickness * 0.5
      );
    }
  }
  const rings = count;
  for (let i = 0; i < (closed ? rings : rings - 1); i++) {
    const i2 = (i + 1) % rings;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a = i * 4 + k, b = i * 4 + k2, c2 = i2 * 4 + k2, d = i2 * 4 + k;
      idx.push(a, b, c2, a, c2, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Mesh geometry from distance-field primitives.
export function fieldGeometry(prims, h, { pad = 0.02, field: customField } = {}) {
  const f = makeField(prims);
  const dist = customField ? customField(f.distance) : f.distance;
  const m = surfaceNets(dist, f.bmin.map((v) => v - pad), f.bmax.map((v) => v + pad), h);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
  return { geometry: geo, field: f, mesh: m };
}

// Lathe around the Y axis from [radius, height] pairs.
export function latheGeometry(profile, segments = 48) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// Finds where a ray from `origin` along `dir` meets the surface of a distance field.
export function raySurface(dist, origin, dir, maxT = 0.5) {
  let t = 0;
  for (let i = 0; i < 64 && t < maxT; i++) {
    const d = dist(origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t);
    if (Math.abs(d) < 1e-4) break;
    t += d * 0.8;
  }
  return t;
}
