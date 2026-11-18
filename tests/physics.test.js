import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pressureAt, boyleVolume, volumeAtDepth, netBuoyancy, terminalSpeed, netForSpeed, bcdForNet,
  simulateDive, sampleAt, DIVER,
} from '../src/physics.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('pressure: 1 bar at the surface and 1 more bar every 10 m', () => {
  close(pressureAt(0), 1);
  close(pressureAt(10), 2);
  close(pressureAt(20), 3);
  close(pressureAt(30), 4);
  close(pressureAt(-5), 1);
});

test("Boyle's law: P1 x V1 = P2 x V2", () => {
  close(boyleVolume(10, 1, 2), 5);
  close(volumeAtDepth(17, 10), 8.5);
  close(volumeAtDepth(12, 20), 4);
  close(volumeAtDepth(12, 30), 3);
  for (const d of [0, 3, 7.5, 18, 33]) close(volumeAtDepth(6, d) * pressureAt(d), 6, 1e-9);
});

test('buoyancy drops with depth as the wetsuit is squeezed', () => {
  let prev = Infinity;
  for (let d = 0; d <= 30; d += 2) {
    const n = netBuoyancy({ depth: d });
    assert.ok(n < prev);
    prev = n;
  }
  close(netBuoyancy({ depth: 0 }), DIVER.surfaceNetKg);
  // At 10 m half the suit's gas is gone: 3 litres less lift.
  close(netBuoyancy({ depth: 10 }), DIVER.surfaceNetKg - 3 * 1.025, 1e-9);
});

test('drag: a horizontal diver falls slower than a vertical one with the same net force', () => {
  const h = terminalSpeed(-2, DIVER.dragArea.horizontal);
  const v = terminalSpeed(-2, DIVER.dragArea.vertical);
  assert.ok(h < 0 && v < 0);
  assert.ok(Math.abs(h) < Math.abs(v));
  close(terminalSpeed(0, 0.75), 0);
  // netForSpeed is the inverse of terminalSpeed.
  for (const s of [-0.3, -0.1, 0.05, 0.2]) close(terminalSpeed(netForSpeed(s, 0.75), 0.75), s, 1e-9);
});

test('bcdForNet returns the gas that gives the wanted buoyancy', () => {
  for (const [target, d] of [[0.5, 0], [-0.5, 5], [-0.5, 12], [0, 30]]) {
    const v = bcdForNet(target, d);
    assert.ok(v > 0);
    close(netBuoyancy({ depth: d, bcdLitres: v }), target, 1e-9);
  }
  // It cannot go below an empty BCD.
  assert.equal(bcdForNet(-50, 0), 0);
});

test('dive profile tells the story in order', () => {
  const p = simulateDive();
  const m = p.marks;
  const order = ['start', 'vent', 'sinking', 'd2', 'd5', 'neutralize', 'd10', 'd20', 'd30', 'ascent', 'd20up', 'd10up', 'stop', 'final', 'surface', 'end'];
  for (let i = 1; i < order.length; i++) assert.ok(m[order[i]] > m[order[i - 1]], `${order[i]} after ${order[i - 1]}`);
  for (const s of p.samples) {
    assert.ok(s.depth >= 0 && s.depth <= 30.0001, 'depth in range');
    assert.ok(Number.isFinite(s.net) && Number.isFinite(s.v));
    assert.ok(s.bcdSL >= 0);
  }
  assert.ok(sampleAt(p, 0).depth === 0);
  assert.ok(sampleAt(p, m.end + 100).depth === 0);
});

test('the free descent speeds up with depth (the horizontal-descent message)', () => {
  const p = simulateDive();
  const speedAt = (d) => {
    const s = p.samples.find((x) => x.phase === 'sinking' && x.depth >= d);
    return -s.v;
  };
  const v1 = speedAt(1), v4 = speedAt(4), v8 = speedAt(8);
  assert.ok(v1 > 0 && v4 > v1 && v8 > v4, `${v1} ${v4} ${v8}`);
  assert.ok(v8 > 1.5 * v1, 'speed grows a lot between 1 m and 8 m');
});

test('the diver keeps adding air to the BCD on the way down and vents it on the way up', () => {
  const p = simulateDive();
  const at = (t) => sampleAt(p, t);
  assert.ok(at(p.marks.d20).bcdSL > at(p.marks.d10).bcdSL);
  assert.ok(at(p.marks.d30 + 1).bcdSL > at(p.marks.d20).bcdSL);
  assert.ok(at(p.marks.d10up).bcdSL < at(p.marks.ascent).bcdSL);
  // Ascent rate stays at about 9 m/min.
  const asc = p.samples.filter((s) => s.phase === 'ascent');
  for (const s of asc) assert.ok(s.v <= 0.1501);
});
