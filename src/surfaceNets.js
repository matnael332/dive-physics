// Naive surface nets: turns a signed distance function into a smooth triangle mesh.
// Vertices are placed in each cell that crosses the surface, pulled onto the surface
// with a Newton step, and shaded with normals taken from the field gradient.
import { gradient } from './sdf.js';

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNets(field, bmin, bmax, h, { project = 2 } = {}) {
  const nx = Math.max(2, Math.ceil((bmax[0] - bmin[0]) / h) + 1);
  const ny = Math.max(2, Math.ceil((bmax[1] - bmin[1]) / h) + 1);
  const nz = Math.max(2, Math.ceil((bmax[2] - bmin[2]) / h) + 1);
  const [ox, oy, oz] = bmin;

  const vals = new Float32Array(nx * ny * nz);
  let p = 0;
  for (let k = 0; k < nz; k++) {
    const z = oz + k * h;
    for (let j = 0; j < ny; j++) {
      const y = oy + j * h;
      for (let i = 0; i < nx; i++) vals[p++] = field(ox + i * h, y, z);
    }
  }
  const val = (i, j, k) => vals[i + nx * (j + ny * k)];

  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const cv = new Float32Array(8);

  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = val(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2]);
          if (cv[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const va = cv[a], vb = cv[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
          sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
          sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
          cnt++;
        }
        cellVert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(ox + (i + sx / cnt) * h, oy + (j + sy / cnt) * h, oz + (k + sz / cnt) * h);
      }
    }
  }

  const cell = (i, j, k) => cellVert[i + cx * (j + cy * k)];
  const idx = [];
  function quad(a, b, c, d, flip) {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b);
    else idx.push(a, b, c, a, c, d);
  }
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const in0 = val(i, j, k) < 0;
        // Edge along x: neighbouring cells in the (y, z) plane.
        if (i < cx && j >= 1 && j < cy && k >= 1 && k < cz && in0 !== (val(i + 1, j, k) < 0)) {
          quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !in0);
        }
        // Edge along y: cells in the (z, x) plane.
        if (j < cy && i >= 1 && i < cx && k >= 1 && k < cz && in0 !== (val(i, j + 1, k) < 0)) {
          quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !in0);
        }
        // Edge along z: cells in the (x, y) plane.
        if (k < cz && i >= 1 && i < cx && j >= 1 && j < cy && in0 !== (val(i, j, k + 1) < 0)) {
          quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !in0);
        }
      }
    }
  }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(positions.length);
  const g = [0, 0, 0];
  const eps = h * 0.25;
  for (let v = 0; v < positions.length; v += 3) {
    let x = positions[v], y = positions[v + 1], z = positions[v + 2];
    for (let s = 0; s < project; s++) {
      const d = field(x, y, z);
      gradient(field, x, y, z, eps, g);
      const step = Math.max(-h, Math.min(h, d));
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    gradient(field, x, y, z, eps, g);
    positions[v] = x; positions[v + 1] = y; positions[v + 2] = z;
    normals[v] = g[0]; normals[v + 1] = g[1]; normals[v + 2] = g[2];
  }

  const count = positions.length / 3;
  const indices = count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { positions, normals, indices, vertexCount: count };
}
