// Live ear-model figure. A short descent without equalizing raises the water pressure in the canal
// by 1 bar per 10 m while the air in the middle ear stays where it was, so the eardrum bulges inward
// and the gauge reads the difference. Equalizing opens the Eustachian tube: air rises from the throat,
// the difference returns to zero and the eardrum to its place.
// Press and hold the figure (or Space / Enter on it) to equalize; left alone, it equalizes by itself.
import { SVG, DATA } from './ear.art.js';
import { applyStyles, move, setAttr, setMarkup, prismAny, dialNeedle } from './draw.js';
import { solidSvg, iso } from '../../vendor/anatomy/iso-kit.mjs';
import { frameOf } from '../../vendor/anatomy/lathe.mjs';
import { unequalizedDelta } from '../physics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const F0 = frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const DESCENT = 0.46; // m/s during the demonstration
const AUTO_AT = 1.2; // m without equalizing before the tour equalizes
const CAP = 2.0; // m: the demonstration stops descending here until you equalize
const IDLE = 6; // s after the last press before the tour takes over again

function drumRing(bulge) {
  const { x, t, z0, z1 } = DATA.DRUM;
  const left = [];
  const right = [];
  for (let i = 0; i <= 10; i++) {
    const z = z0 + ((z1 - z0) * i) / 10;
    const u = (2 * (z - z0)) / (z1 - z0) - 1;
    const cx = x + bulge * (1 - u * u);
    left.push([cx - t / 2, z]);
    right.unshift([cx + t / 2, z]);
  }
  return [...left, ...right];
}
function flapRing(angle) {
  const { hinge: [hx, hz], len, t, closed } = DATA.FLAP;
  const a = closed + angle;
  const [ux, uz] = [Math.cos(a), Math.sin(a)];
  const [nx, nz] = [-uz, ux];
  return [[hx, hz], [hx + ux * len, hz + uz * len], [hx + ux * len - nx * t, hz + uz * len - nz * t], [hx - nx * t, hz - nz * t]];
}
// point at fraction u along the puff path, in world space
const PATH = DATA.PUFF_PATH;
const LENGTHS = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
const TOTAL = LENGTHS.reduce((a, b) => a + b, 0);
function along(u) {
  let d = clamp(u, 0, 1) * TOTAL;
  for (let i = 0; i < LENGTHS.length; i++) {
    if (d <= LENGTHS[i] || i === LENGTHS.length - 1) {
      const f = clamp(d / LENGTHS[i], 0, 1);
      return [PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * f, DATA.PUFF_Y, PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * f];
    }
    d -= LENGTHS[i];
  }
  return [PATH[0][0], DATA.PUFF_Y, PATH[0][1]];
}

export function createEarFigure(host) {
  let els = null;
  const S = { metres: 0, mode: 'descend', timer: 0, held: false, lastTouch: -1e9, clock: 0, open: 0, puffs: [], debt: 0 };

  function mount() {
    host.innerHTML = SVG;
    applyStyles(host);
    host.querySelector('svg').setAttribute('aria-hidden', 'true');
    const part = (name) => host.querySelector(`[data-part="${name}"]`);
    els = { drum: part('drum'), malleus: part('malleus'), flap: part('flap'), needle: part('needle'), puffs: part('puffs') };
    const press = (on) => {
      S.held = on;
      S.lastTouch = S.clock;
    };
    host.addEventListener('pointerdown', (e) => {
      press(true);
      e.preventDefault();
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) host.addEventListener(type, () => S.held && press(false));
    host.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) press(true);
    });
    host.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') press(false);
    });
  }

  function step(dt) {
    S.clock += dt;
    const touring = S.clock - S.lastTouch > IDLE;
    const equalizing = S.held || S.mode === 'equalize';
    if (equalizing) {
      const before = S.metres;
      S.metres *= Math.exp(-dt / 0.22);
      if (S.metres < 0.01) S.metres = 0;
      S.debt += (before - S.metres) * 9 + dt * 2; // puffs follow the air that moves
      if (S.mode === 'equalize' && (S.timer -= dt) <= 0) {
        S.mode = 'rest';
        S.timer = 0.7;
      }
    } else if (S.mode === 'rest') {
      if ((S.timer -= dt) <= 0) S.mode = 'descend';
    } else {
      S.metres = Math.min(CAP, S.metres + DESCENT * dt);
      if (touring && S.metres >= AUTO_AT) {
        S.mode = 'equalize';
        S.timer = 0.8;
      }
    }
    S.open += ((equalizing ? 1 : 0) - S.open) * (1 - Math.exp(-dt / 0.12));
    while (S.debt >= 1) {
      S.debt -= 1;
      S.puffs.push(0);
    }
    S.puffs = S.puffs.map((u) => u + dt / 1.1).filter((u) => u < 1);
  }

  function draw() {
    const dp = unequalizedDelta(S.metres);
    const bulge = DATA.BULGE_MAX * clamp(dp / DATA.DP_MAX, 0, 1);
    setMarkup(els.drum, solidSvg(prismAny(F0, drumRing(bulge), DATA.POCKET, 0, DATA.P), { tone: 'hi', lit: true }));
    move(els.malleus, DATA.P, [bulge, 0, 0]);
    setMarkup(els.flap, solidSvg(prismAny(F0, flapRing(S.open * DATA.FLAP.open), DATA.FLAP.y[0], DATA.FLAP.y[1], DATA.P), { tone: 'hi' }));
    setAttr(els.needle, 'd', dialNeedle(DATA.DIAL.c, [0, 0, 1], [1, 0, 0], DATA.DIAL.r, dp / DATA.DP_MAX, DATA.P, { tail: 1.3 }));
    const dots = S.puffs
      .map((u) => {
        const [x, y] = iso(along(u), DATA.P);
        const r = 0.9 + 0.6 * Math.sin(Math.PI * clamp(u, 0, 1));
        return `<circle class="fig-puff" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}"/>`;
      })
      .join('');
    setMarkup(els.puffs, dots);
    return { dp, metres: S.metres, equalizing: S.open > 0.5, held: S.held };
  }

  // dt in seconds; still = show one calm state without animation
  function update(dt, still = false) {
    if (!els) mount();
    if (still) {
      S.metres = S.held ? 0 : AUTO_AT;
      S.open = S.held ? 1 : 0;
      S.puffs = [];
      return draw();
    }
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < sub; i++) step(dt / sub);
    return draw();
  }

  return { update };
}
