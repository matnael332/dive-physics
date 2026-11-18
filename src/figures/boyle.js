// Live pressure-pot figure: the balloon shrinks with the dive's pressure (Boyle), the height gauge
// follows its top, the dial reads the depth, the pump strokes while the pressure rises and the
// bleed valve opens while it falls.
import { SVG, DATA } from './boyle.art.js';
import { applyStyles, move, setAttr, setMarkup, prismAny, dialNeedle } from './draw.js';
import { solidSvg } from '../../vendor/anatomy/iso-kit.mjs';
import { frameOf } from '../../vendor/anatomy/lathe.mjs';
import { balloonScale, pressureAt } from '../physics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const LEVER_F = frameOf([DATA.BLEED.c[0], DATA.BLEED.c[1], 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

function leverRing(angle) {
  const { len, w } = DATA.BLEED;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[-1.2, -w / 2], [len, -w / 2], [len, w / 2], [-1.2, w / 2]].map(([u, v]) => [u * c - v * s, u * s + v * c]);
}

export function createBoyleFigure(host) {
  let els = null;
  const S = { depth: null, rate: 0, phase: 0, pump: 0, open: 0 };

  function mount() {
    host.innerHTML = SVG;
    applyStyles(host);
    host.querySelector('svg').setAttribute('aria-hidden', 'true');
    const part = (name) => host.querySelector(`[data-part="${name}"]`);
    els = { balloon: part('balloon'), arm: part('arm'), needle: part('needle'), pump: part('pump'), bleed: part('bleed') };
  }

  // depth in metres; dt in seconds; still = no animation beyond following the depth
  function update(dt, depth, still = false) {
    if (!els) mount();
    const P = pressureAt(depth);
    const s = balloonScale(P);
    const [kx, ky] = DATA.K;
    setAttr(els.balloon, 'transform', `matrix(${s.toFixed(4)} 0 0 ${s.toFixed(4)} ${((1 - s) * kx).toFixed(2)} ${((1 - s) * ky).toFixed(2)})`);
    const top = DATA.KNOT_Z + (DATA.TOP0 - DATA.KNOT_Z) * s;
    move(els.arm, DATA.P, [0, 0, top - DATA.TOP0]);
    setAttr(els.needle, 'd', dialNeedle(DATA.DIAL.c, [0, -1, 0], [1, 0, 0], DATA.DIAL.r, depth / DATA.DEPTH_MAX, DATA.P, { tail: 1.2 }));

    // pump while the pressure rises, bleed while it falls (rates in metres per second of the shown dive)
    const rate = S.depth === null || dt <= 0 ? 0 : (depth - S.depth) / dt;
    S.depth = depth;
    if (still) {
      S.rate = 0;
      S.pump = 0;
      S.open = 0;
    } else {
      S.rate += (clamp(rate, -20, 20) - S.rate) * (1 - Math.exp(-dt / 0.3));
      const pumping = clamp(S.rate / 0.6, 0, 1);
      S.pump += (pumping - S.pump) * (1 - Math.exp(-dt / 0.35));
      if (S.pump > 0.02) S.phase += dt * Math.PI * 2 * 1.2;
      else S.phase = 0;
      S.open += (clamp(-S.rate / 0.6, 0, 1) - S.open) * (1 - Math.exp(-dt / 0.3));
    }
    move(els.pump, DATA.P, [0, 0, -DATA.PUMP_STROKE * S.pump * (0.5 - 0.5 * Math.cos(S.phase))]);
    const angle = (S.open * Math.PI) / 2;
    setMarkup(els.bleed, solidSvg(prismAny(LEVER_F, leverRing(angle), DATA.BLEED.z, DATA.BLEED.z + DATA.BLEED.h, DATA.P), { tone: 'mid' }));
    return { pressure: P, scale: s, pumping: S.pump > 0.1, bleeding: S.open > 0.1 };
  }

  return { update };
}
