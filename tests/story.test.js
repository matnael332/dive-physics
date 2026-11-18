import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateDive } from '../src/physics.js';
import { buildChapters } from '../src/story.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('chapters cover the dive in order without gaps', () => {
  const { marks } = simulateDive();
  const ch = buildChapters(marks);
  for (let i = 0; i < ch.length; i++) {
    assert.ok(ch[i].t[1] > ch[i].t[0], ch[i].id);
    if (i > 0) assert.equal(ch[i].t[0], ch[i - 1].t[1], `${ch[i].id} starts where ${ch[i - 1].id} ends`);
  }
  assert.equal(ch[ch.length - 1].t[1], marks.end);
});

test('every chapter has a section in the page and every section has a chapter', () => {
  const { marks } = simulateDive();
  const ids = buildChapters(marks).map((c) => c.id);
  const sections = [...html.matchAll(/data-ch="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ids);
});

test('page keeps a strict content security policy and no inline script or style', () => {
  assert.match(html, /script-src 'self';/);
  assert.match(html, /default-src 'none';/);
  assert.doesNotMatch(html, /unsafe-(inline|eval)/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /<script>[^<]/);
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /<style/);
});
