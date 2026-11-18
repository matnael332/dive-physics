import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pressureAt, balloonScale, unequalizedDelta, volumeAtDepth } from '../src/physics.js';
import * as ear from '../src/figures/ear.art.js';
import * as boyle from '../src/figures/boyle.art.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('figure art is safe under the page CSP: no inline style, script or event handler', () => {
  for (const { SVG } of [ear, boyle]) {
    assert.doesNotMatch(SVG, /\sstyle="/);
    assert.doesNotMatch(SVG, /<script/i);
    assert.doesNotMatch(SVG, /\son[a-z]+="/i);
    assert.match(SVG, /^<svg[^>]*viewBox="/);
  }
});

test('every part the page moves exists in the art', () => {
  for (const name of ['drum', 'malleus', 'flap', 'needle', 'puffs']) assert.match(ear.SVG, new RegExp(`data-part="${name}"`), `ear ${name}`);
  for (const name of ['balloon', 'arm', 'needle', 'pump', 'bleed']) assert.match(boyle.SVG, new RegExp(`data-part="${name}"`), `pot ${name}`);
});

test('the balloon follows Boyle: 1/2, 1/3 and 1/4 of 17 L at 10, 20 and 30 m', () => {
  close(volumeAtDepth(17, 10), 8.5);
  close(volumeAtDepth(17, 20), 17 / 3);
  close(volumeAtDepth(17, 30), 4.25);
  // drawn size scales with the cube root of the volume
  for (const d of [0, 10, 20, 30, 40]) close(balloonScale(pressureAt(d)) ** 3, volumeAtDepth(17, d) / 17, 1e-12);
});

test('the height gauge marks sit where the balloon top is at 1 to 5 bar', () => {
  const { KNOT_Z, TOP0 } = boyle.DATA;
  const top = (p) => KNOT_Z + (TOP0 - KNOT_Z) * balloonScale(p);
  assert.ok(top(1) > top(2) && top(2) > top(3) && top(3) > top(4), 'the balloon top drops with pressure');
  close(top(1), TOP0);
});

test('an unequalized descent presses on the eardrum by 0.1 bar per metre', () => {
  close(unequalizedDelta(1.2), 0.12);
  close(unequalizedDelta(2), 0.2);
  assert.equal(unequalizedDelta(-1), 0);
  assert.equal(ear.DATA.DP_MAX, 0.2);
});

test('the page loads the figure styles from a file', () => {
  assert.match(html, /<link rel="stylesheet" href="css\/figures\.css">/);
  const css = readFileSync(new URL('../css/figures.css', import.meta.url), 'utf8');
  assert.match(css, /\.fig\.iso\{/);
  for (const id of ['earFig', 'boyleFig', 'earState', 'earDelta', 'earMetres']) assert.match(html, new RegExp(`id="${id}"`));
});
