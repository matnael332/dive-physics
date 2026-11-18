// Drawing helpers shared by the figure builds (Node) and the page (browser).
// The page has a strict CSP (no inline style attributes), so markup never carries style="";
// styles travel as data-style and are applied through the CSSOM, which CSP allows.
import { iso, pathOf, translateAlong } from '../../vendor/anatomy/iso-kit.mjs';
import { add3, mul3, dot3, viewOf, toneOf } from '../../vendor/anatomy/lathe.mjs';

// Replace inline style attributes with data-style.
export function cspSafe(markup) {
  return markup.replace(/ style="([^"]*)"/g, ' data-style="$1"');
}

// Apply data-style attributes under root through the CSSOM.
export function applyStyles(root) {
  for (const el of root.querySelectorAll('[data-style]')) {
    el.style.cssText = el.getAttribute('data-style');
    el.removeAttribute('data-style');
  }
}

// Set innerHTML only when it changed, keeping it CSP-safe.
export function setMarkup(el, markup) {
  if (el.__markup === markup) return;
  el.__markup = markup;
  el.innerHTML = cspSafe(markup);
  applyStyles(el);
}

// Move an element by a world-space offset.
export function move(el, P, by) {
  const t = translateAlong(P, by);
  if (el.__t !== t) {
    el.setAttribute('transform', t);
    el.__t = t;
  }
}

export function setAttr(el, name, value) {
  const key = '__' + name;
  if (el[key] !== value) {
    el.setAttribute(name, value);
    el[key] = value;
  }
}

// A prism of any (also concave) polygon along a frame F (o, a = axis, u, v), shaded like the kit.
// Returns the path set solidSvg expects.
export function prismAny(F, ring, s0, s1, P) {
  const V = viewOf(P);
  const at = (p) => iso(p, P);
  const area = ring.reduce((sum, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return sum + x * y2 - x2 * y;
  }, 0);
  const pts = area > 0 ? ring : [...ring].reverse();
  const n = pts.length;
  const p3 = (s, [x, y]) => add3(add3(add3(F.o, mul3(F.a, s)), mul3(F.u, x)), mul3(F.v, y));
  const lo = pts.map((p) => at(p3(s0, p)));
  const hi = pts.map((p) => at(p3(s1, p)));
  const normals = pts.map(([x0, y0], j) => {
    const [x1, y1] = pts[(j + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    return add3(mul3(F.u, (y1 - y0) / len), mul3(F.v, -(x1 - x0) / len));
  });
  const side = normals.map((m) => dot3(m, V) > 1e-6);
  const caps = [dot3(mul3(F.a, -1), V) > 1e-6, dot3(F.a, V) > 1e-6];
  const orient = (poly) => {
    const s = poly.reduce((sum, [x, y], i) => {
      const [x2, y2] = poly[(i + 1) % poly.length];
      return sum + x * y2 - x2 * y;
    }, 0);
    return s < 0 ? [...poly].reverse() : poly;
  };
  const faces = [];
  const buckets = [[], [], [], [], []];
  for (let j = 0; j < n; j++) {
    if (!side[j]) continue;
    const q = pathOf(orient([lo[j], lo[(j + 1) % n], hi[(j + 1) % n], hi[j]]), true);
    faces.push(q);
    buckets[toneOf(normals[j], P)].push(q);
  }
  [[lo, mul3(F.a, -1), caps[0]], [hi, F.a, caps[1]]].forEach(([poly, normal, seen]) => {
    if (!seen) return;
    const q = pathOf(orient(poly), true);
    faces.push(q);
    buckets[toneOf(normal, P)].push(q);
  });
  const outline = [];
  const crease = [];
  for (let j = 0; j < n; j++) {
    const nx = (j + 1) % n;
    [[lo, caps[0]], [hi, caps[1]]].forEach(([poly, seen]) => {
      if (side[j] !== seen) outline.push(pathOf([poly[j], poly[nx]]));
      else if (side[j] && seen) crease.push(pathOf([poly[j], poly[nx]]));
    });
    const prev = (j - 1 + n) % n;
    if (side[prev] !== side[j]) outline.push(pathOf([lo[j], hi[j]]));
  }
  return { fill: faces.join(''), outline: outline.join(''), crease: crease.join(''), top: buckets[4].join(''), shades: buckets.slice(0, 4).map((l) => l.join('')) };
}

// Needle of a dial whose face lies in the plane spanned by e1 (zero direction) and e2 (positive turn),
// value 0..1 over `span` radians starting at `from`.
export function dialNeedle(center, e1, e2, r, value, P, { from = -0.75 * Math.PI, span = 1.5 * Math.PI, tail = 1.4 } = {}) {
  const a = from + Math.min(1, Math.max(0, value)) * span;
  const dir = add3(mul3(e1, Math.cos(a)), mul3(e2, Math.sin(a)));
  return pathOf([iso(add3(center, mul3(dir, -tail)), P), iso(add3(center, mul3(dir, r)), P)]);
}
