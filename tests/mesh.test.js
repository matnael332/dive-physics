import test from 'node:test';
import assert from 'node:assert/strict';
import { makeField, smin, sdEllipsoid, sdTaper } from '../src/sdf.js';
import { surfaceNets } from '../src/surfaceNets.js';
import { bodyPrims, lungPrims, BONES, JOINTS, PARENT } from '../src/diverShape.js';

test('distance primitives: sign and size', () => {
  assert.ok(sdEllipsoid(0, 0, 0, 1, 2, 3) < 0);
  assert.ok(Math.abs(sdEllipsoid(1, 0, 0, 1, 2, 3)) < 1e-9);
  assert.ok(sdEllipsoid(2, 0, 0, 1, 1, 1) > 0.9);
  assert.ok(Math.abs(sdTaper(0, 1, 0, [0, 0, 0], [0, 0, 1], 1, 1)) < 1e-9);
  assert.ok(smin(1, 1, 0.5) < 1 && smin(1, 5, 0.5) === 1);
});

test('surface nets: a sphere becomes a closed mesh on its surface', () => {
  const R = 0.5;
  const f = (x, y, z) => Math.hypot(x, y, z) - R;
  const m = surfaceNets(f, [-0.6, -0.6, -0.6], [0.6, 0.6, 0.6], 0.05);
  assert.ok(m.vertexCount > 300);
  for (let i = 0; i < m.vertexCount; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    assert.ok(Math.abs(Math.hypot(x, y, z) - R) < 0.005, 'vertex on the surface');
    const n = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
    assert.ok(Math.abs(n - 1) < 1e-4, 'unit normal');
    // Normals point outward.
    assert.ok(m.normals[i * 3] * x + m.normals[i * 3 + 1] * y + m.normals[i * 3 + 2] * z > 0);
  }
  // Closed surface: every edge is shared by exactly two triangles.
  const edges = new Map();
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = m.indices[t + k], b = m.indices[t + ((k + 1) % 3)];
      const key = a < b ? a + ':' + b : b + ':' + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const c of edges.values()) assert.equal(c, 2);
  // Triangles face outward (winding agrees with the normals).
  let agree = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * a[0] + n[1] * a[1] + n[2] * a[2] > 0) agree++;
  }
  assert.equal(agree, m.indices.length / 3);
});

test('skeleton: every bone has a valid parent and a single root', () => {
  const roots = BONES.filter((b) => PARENT[b] === null);
  assert.deepEqual(roots, ['pelvis']);
  for (const b of BONES) if (PARENT[b]) assert.ok(BONES.includes(PARENT[b]));
  for (const b of BONES) assert.equal(JOINTS[b].length, 3);
});

test('diver body: human-sized, finite and skinned to real bones', () => {
  const field = makeField(bodyPrims(), { boneNames: BONES });
  const m = surfaceNets(field.distance, field.bmin.map((v) => v - 0.03), field.bmax.map((v) => v + 0.03), 0.014);
  assert.ok(m.vertexCount > 5000);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i++) {
    assert.ok(Number.isFinite(m.positions[i]));
    min[i % 3] = Math.min(min[i % 3], m.positions[i]);
    max[i % 3] = Math.max(max[i % 3], m.positions[i]);
  }
  const length = max[0] - min[0];
  assert.ok(length > 1.5 && length < 2.0, `head-to-toe length ${length}`); // trim pose with bent knees
  assert.ok(max[2] - min[2] < 0.75, 'shoulder width');
  for (let i = 0; i < m.vertexCount; i += 97) {
    const w = field.boneWeights(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    assert.ok(w.size > 0);
    for (const b of w.keys()) assert.ok(b >= 0 && b < BONES.length);
  }
});

test('lungs sit inside the chest', () => {
  const body = makeField(bodyPrims());
  const lungs = makeField(lungPrims());
  const m = surfaceNets(lungs.distance, lungs.bmin.map((v) => v - 0.02), lungs.bmax.map((v) => v + 0.02), 0.012);
  let inside = 0;
  for (let i = 0; i < m.vertexCount; i++) {
    if (body.distance(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]) < 0) inside++;
  }
  assert.ok(inside / m.vertexCount > 0.97, `${inside}/${m.vertexCount}`);
});
