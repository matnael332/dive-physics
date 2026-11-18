// The diver: a skinned wetsuit body generated from distance fields, plus a full scuba kit.
import * as THREE from 'three';
import { makeField, gradient } from '../sdf.js';
import { surfaceNets } from '../surfaceNets.js';
import {
  JOINTS, PARENT, BONES, TOES, HEAD, headPoint, bodyPrims, torsoPrims, lungPrims, HEAD_AIR, suitColor,
} from '../diverShape.js';
import { addCaustics } from './caustics.js';
import { hoseGeometry, strapGeometry, fieldGeometry, latheGeometry, raySurface } from './geom.js';
import { glowMaterial } from './materials.js';
import { addWetsuitDetail, addBcdDetail } from './detail.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BODY_RES = 0.0105;

function std(params) {
  return addCaustics(new THREE.MeshStandardMaterial(params));
}
function phys(params) {
  return addCaustics(new THREE.MeshPhysicalMaterial(params));
}

export function buildDiver() {
  const group = new THREE.Group();
  group.name = 'diver';

  // ---------- skeleton ----------
  const bones = {};
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of BONES) {
    const j = JOINTS[name], p = PARENT[name];
    if (p) {
      const pj = JOINTS[p];
      bones[name].position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      bones[p].add(bones[name]);
    } else {
      bones[name].position.set(j[0], j[1], j[2]);
    }
  }
  // Places an object given in diver coordinates under a bone.
  function attach(boneName, obj, at = [0, 0, 0]) {
    const j = JOINTS[boneName];
    obj.position.set(at[0] - j[0], at[1] - j[1], at[2] - j[2]);
    bones[boneName].add(obj);
    return obj;
  }

  const chromeEarly = std({ color: 0xd9dee4, roughness: 0.16, metalness: 1 });

  // ---------- body ----------
  const bodyField = makeField(bodyPrims(), { boneNames: BONES });
  const pad = 0.03;
  const bm = surfaceNets(bodyField.distance, bodyField.bmin.map((v) => v - pad), bodyField.bmax.map((v) => v + pad), BODY_RES);
  const n = bm.vertexCount;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const colors = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = bm.positions[v * 3], y = bm.positions[v * 3 + 1], z = bm.positions[v * 3 + 2];
    const w = [...bodyField.boneWeights(x, y, z).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!w.length) w.push([0, 1]);
    const sum = w.reduce((s, e) => s + e[1], 0);
    w.forEach(([bi, wt], k) => {
      skinIndex[v * 4 + k] = bi;
      skinWeight[v * 4 + k] = wt / sum;
    });
    const c = suitColor(BONES[w[0][0]], [x, y, z], [bm.normals[v * 3], bm.normals[v * 3 + 1], bm.normals[v * 3 + 2]]);
    colors[v * 3] = c[0]; colors[v * 3 + 1] = c[1]; colors[v * 3 + 2] = c[2];
  }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(bm.positions, 3));
  bodyGeo.setAttribute('normal', new THREE.BufferAttribute(bm.normals, 3));
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  bodyGeo.setIndex(new THREE.BufferAttribute(bm.indices, 1));
  const bodyMat = addWetsuitDetail(phys({
    vertexColors: true, roughness: 0.66, metalness: 0, sheen: 0.4, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x2d3e50), transparent: true, envMapIntensity: 0.6,
  }));
  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  body.add(bones.pelvis);
  body.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(BONES.map((b) => bones[b])));
  body.frustumCulled = false;
  group.add(body);

  // ---------- BCD jacket (inflatable) ----------
  const torso = makeField(torsoPrims());
  const slab = (x) => Math.max(0.07 - x, x - 0.53);
  const inflated = (y) => {
    const t = Math.min(1, Math.max(0, (y + 0.02) / 0.14));
    return 0.026 + (0.064 - 0.026) * t * t * (3 - 2 * t);
  };
  const DEFLATED = 0.013;
  const smax = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  };
  const bcdDist = (x, y, z) => smax(torso.distance(x, y, z) - inflated(y), slab(x), 0.05);
  const bcdM = surfaceNets(bcdDist, [0.04, -0.24, -0.29], [0.56, 0.28, 0.29], 0.0115);
  const bn = bcdM.vertexCount;
  const flatPos = new Float32Array(bn * 3), flatNorm = new Float32Array(bn * 3), bcdColor = new Float32Array(bn * 3);
  const g = [0, 0, 0];
  for (let v = 0; v < bn; v++) {
    const x = bcdM.positions[v * 3], y = bcdM.positions[v * 3 + 1], z = bcdM.positions[v * 3 + 2];
    const s = torso.distance(x, y, z);
    const onCap = slab(x) > -0.012;
    gradient(torso.distance, x, y, z, 0.002, g);
    const move = Math.max(0, s - DEFLATED);
    const px = x - g[0] * move, py = y - g[1] * move, pz = z - g[2] * move;
    flatPos[v * 3] = px; flatPos[v * 3 + 1] = py; flatPos[v * 3 + 2] = pz;
    if (onCap) {
      flatNorm.set(bcdM.normals.subarray(v * 3, v * 3 + 3), v * 3);
    } else {
      gradient(torso.distance, px, py, pz, 0.002, g);
      flatNorm[v * 3] = g[0]; flatNorm[v * 3 + 1] = g[1]; flatNorm[v * 3 + 2] = g[2];
    }
    let c = [0.008, 0.0085, 0.01];
    if (y > 0.12) c = [0.014, 0.015, 0.017];
    if (Math.abs(x - 0.43) < 0.013 && y < -0.03) c = [0.05, 0.052, 0.056];
    if (onCap) c = [0.004, 0.004, 0.005];
    bcdColor[v * 3] = c[0]; bcdColor[v * 3 + 1] = c[1]; bcdColor[v * 3 + 2] = c[2];
  }
  const bcdGeo = new THREE.BufferGeometry();
  bcdGeo.setAttribute('position', new THREE.BufferAttribute(flatPos, 3));
  bcdGeo.setAttribute('normal', new THREE.BufferAttribute(flatNorm, 3));
  bcdGeo.setAttribute('color', new THREE.BufferAttribute(bcdColor, 3));
  bcdGeo.morphAttributes.position = [new THREE.BufferAttribute(bcdM.positions, 3)];
  bcdGeo.morphAttributes.normal = [new THREE.BufferAttribute(bcdM.normals, 3)];
  bcdGeo.setIndex(new THREE.BufferAttribute(bcdM.indices, 1));
  const bcdMat = addBcdDetail(phys({ vertexColors: true, roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color(0x3a4b5c), transparent: true }));
  const bcd = new THREE.Mesh(bcdGeo, bcdMat);
  bcd.morphTargetInfluences = [0.5];
  attach('chest', bcd);
  // Glowing copy for the X-ray view: the BCD is an air space too.
  const bcdGlow = new THREE.Mesh(bcdGeo, new THREE.MeshBasicMaterial({
    color: 0x58e1ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  bcdGlow.morphTargetInfluences = [0.5];
  bcdGlow.renderOrder = 5;
  attach('chest', bcdGlow);

  // BCD hardware: shoulder straps, chest strap and buckle, D-rings and pockets.
  // Each is built for an empty and a full BCD and follows the inflation.
  const chestJ0 = JOINTS.chest;
  const toChestP = (p) => [p[0] - chestJ0[0], p[1] - chestJ0[1], p[2] - chestJ0[2]];
  function onBcd(p0, infl, off = 0) {
    let [x, y, z] = p0;
    const gg = [0, 0, 0];
    for (let i = 0; i < 8; i++) {
      const target = DEFLATED + infl * (inflated(y) - DEFLATED) + off;
      const d = torso.distance(x, y, z) - target;
      gradient(torso.distance, x, y, z, 0.002, gg);
      const step = Math.max(-0.03, Math.min(0.03, d));
      x -= gg[0] * step; y -= gg[1] * step; z -= gg[2] * step;
    }
    gradient(torso.distance, x, y, z, 0.002, gg);
    return { p: [x, y, z], n: [gg[0], gg[1], gg[2]] };
  }
  const strapMat = std({ color: 0x141619, roughness: 0.82 });
  const hardware = [];
  const strapMeshes = [];
  function morphStrap(guide, off, width, thick, widthDir) {
    const a = strapGeometry(guide.map((g) => toChestP(onBcd(g, 0, off).p)), width, thick, widthDir);
    const b = strapGeometry(guide.map((g) => toChestP(onBcd(g, 1, off).p)), width, thick, widthDir);
    a.morphAttributes.position = [b.attributes.position];
    a.morphAttributes.normal = [b.attributes.normal];
    const m = new THREE.Mesh(a, strapMat);
    m.morphTargetInfluences = [0.5];
    bones.chest.add(m);
    strapMeshes.push(m);
  }
  function bcdPart(obj, guide, off, along = [1, 0, 0]) {
    const make = (infl) => {
      const { p, n } = onBcd(guide, infl, off);
      const N = new THREE.Vector3(...n);
      const A = new THREE.Vector3(...along);
      const X = A.addScaledVector(N, -N.dot(A)).normalize();
      const Y = new THREE.Vector3().crossVectors(N, X);
      return {
        pos: new THREE.Vector3(...toChestP(p)),
        q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, N)),
      };
    };
    bones.chest.add(obj);
    hardware.push({ obj, a: make(0), b: make(1) });
  }
  for (const zs of [-1, 1]) {
    morphStrap([[0.36, 0.2, 0.1 * zs], [0.44, 0.19, 0.105 * zs], [0.5, 0.14, 0.11 * zs], [0.53, 0.06, 0.12 * zs],
      [0.52, -0.03, 0.125 * zs], [0.48, -0.1, 0.125 * zs], [0.42, -0.14, 0.12 * zs], [0.34, -0.15, 0.115 * zs]],
    0.003, 0.046, 0.006, [0, 0, 1]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0028, 8, 28), chromeEarly);
    bcdPart(ring, [0.5, -0.05, 0.12 * zs], 0.01);
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.075, 0.024, 2, 0.008), strapMat);
    const zip = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.092, 6), chromeEarly);
    zip.rotation.z = Math.PI / 2;
    zip.position.set(0, 0.026, 0.0125);
    pocket.add(zip);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.003), chromeEarly);
    pull.position.set(0.04, 0.018, 0.014);
    pocket.add(pull);
    bcdPart(pocket, [0.17, -0.07, 0.17 * zs], 0.012);
  }
  morphStrap([-0.125, -0.09, -0.05, 0, 0.05, 0.09, 0.125].map((z) => [0.44, -0.12, z]), 0.009, 0.022, 0.004, [1, 0, 0]);
  {
    const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.052, 0.012, 2, 0.003), std({ color: 0x1e2126, roughness: 0.45, metalness: 0.1 }));
    bcdPart(buckle, [0.44, -0.13, 0], 0.014);
  }

  // ---------- tank, valve, first stage ----------
  const tankMat = phys({ color: 0xe6b20f, roughness: 0.32, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.18, transparent: true });
  const chrome = std({ color: 0xd9dee4, roughness: 0.16, metalness: 1 });
  const rubber = std({ color: 0x0f1013, roughness: 0.55 });
  const yellowRubber = std({ color: 0xe9c216, roughness: 0.45 });
  const webbing = std({ color: 0x141518, roughness: 0.9 });
  const darkPlastic = std({ color: 0x24282e, roughness: 0.4, metalness: 0.1 });

  const R = 0.092, LC = 0.25;
  const prof = [[0.001, -LC - 0.07]];
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * Math.PI * 0.5;
    prof.push([R * Math.sin(t), -LC - 0.07 * Math.cos(t)]);
  }
  prof.push([R, LC]);
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * Math.PI * 0.5;
    const r = R * Math.cos(t);
    if (r < 0.026) break;
    prof.push([r, LC + 0.075 * Math.sin(t)]);
  }
  prof.push([0.026, LC + 0.075], [0.024, LC + 0.095], [0.001, LC + 0.095]);
  const tankParts = [tankMat];
  const tank = new THREE.Mesh(latheGeometry(prof, 56), tankMat);
  tank.rotation.z = -Math.PI / 2;
  attach('chest', tank, [0.3, 0.268, 0]);
  for (const bx of [0.12, 0.31]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.045, 56, 1, true), webbing);
    band.material.side = THREE.DoubleSide;
    band.rotation.z = -Math.PI / 2;
    attach('chest', band, [bx, 0.268, 0]);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.03), darkPlastic);
    attach('chest', cam, [bx, 0.268 + R + 0.008, 0.03]);
  }
  {
    // Rubber boot over the bottom of the tank.
    const boot = new THREE.Mesh(latheGeometry([[0.001, -0.334], [0.07, -0.334], [0.088, -0.327], [R + 0.006, -0.31], [R + 0.007, -0.27], [R + 0.007, -0.192], [R + 0.002, -0.186]], 56), std({ color: 0x111317, roughness: 0.7, transparent: true }));
    tankParts.push(boot.material);
    boot.rotation.z = -Math.PI / 2;
    attach('chest', boot, [0.3, 0.268, 0]);
    // A printed band around the tank.
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 96;
    const c = cv.getContext('2d');
    c.fillStyle = '#f1f1ec'; c.fillRect(0, 0, 1024, 96);
    c.fillStyle = '#1f4f9a'; c.fillRect(0, 0, 1024, 10); c.fillRect(0, 86, 1024, 10);
    c.fillStyle = '#1f4f9a'; c.fillRect(0, 40, 1024, 16);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0012, R + 0.0012, 0.085, 64, 1, true), phys({ map: tex, roughness: 0.4, clearcoat: 0.5, transparent: true }));
    tankParts.push(band.material);
    band.rotation.z = -Math.PI / 2;
    attach('chest', band, [0.36, 0.268, 0]);
    // Side labels that read along the tank.
    const lc = document.createElement('canvas');
    lc.width = 160; lc.height = 512;
    const g2 = lc.getContext('2d');
    g2.fillStyle = '#f3f3ee'; g2.fillRect(0, 0, 160, 512);
    g2.fillStyle = '#1f4f9a'; g2.fillRect(0, 0, 160, 14); g2.fillRect(0, 498, 160, 14);
    g2.save();
    g2.translate(80, 256);
    g2.rotate(Math.PI / 2);
    g2.fillStyle = '#1b2a44'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.font = 'bold 96px Arial';
    g2.fillText('AIR', 0, -12);
    g2.font = 'bold 30px Arial';
    g2.fillText('232 BAR  12 L', 0, 52);
    g2.restore();
    const ltex = new THREE.CanvasTexture(lc);
    ltex.colorSpace = THREE.SRGBColorSpace;
    ltex.anisotropy = 4;
    const labelMat = phys({ map: ltex, roughness: 0.35, clearcoat: 0.6, transparent: true });
    tankParts.push(labelMat);
    for (const th of [Math.PI, 0]) {
      const label = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0011, R + 0.0011, 0.24, 24, 1, true, th - 0.55, 1.1), labelMat);
      label.rotation.z = -Math.PI / 2;
      attach('chest', label, [0.2, 0.268, 0]);
    }
  }
  const valve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.055), chrome);
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 6), chrome);
  hex.rotation.z = Math.PI / 2;
  attach('chest', hex, [0.695, 0.268, 0]);
  attach('chest', valve, [0.665, 0.268, 0]);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 24), rubber);
  wheel.rotation.x = Math.PI / 2;
  attach('chest', wheel, [0.665, 0.268, -0.045]);
  const firstStage = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.08, 28), chrome);
  firstStage.rotation.x = Math.PI / 2;
  attach('chest', firstStage, [0.672, 0.29, 0.02]);
  const fsCap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 20), chrome);
  attach('chest', fsCap, [0.672, 0.315, 0.02]);

  // ---------- head gear (built in head coordinates) ----------
  const headFrame = new THREE.Group();
  {
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...HEAD.S), new THREE.Vector3(...HEAD.U), new THREE.Vector3(...HEAD.F)
    );
    headFrame.setRotationFromMatrix(m);
    attach('head', headFrame, HEAD.C);
  }
  // Mask outline in head coordinates (x to the left, y up), centred at the eyes.
  const MASK_Y = 0.032;
  const outline = [];
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const pw = 2 / 3.4;
    let x = 0.075 * Math.sign(c) * Math.abs(c) ** pw;
    let y = 0.034 * Math.sign(s) * Math.abs(s) ** pw;
    const dBottom = Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2));
    const dTop = Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2));
    y -= 0.024 * Math.exp(-((dBottom / 0.32) ** 2));
    y -= 0.007 * Math.exp(-((dTop / 0.28) ** 2));
    outline.push([x, y]);
  }
  const faceZ = (x, y) => {
    const q = 1 - (x / 0.088) ** 2 - (y / 0.115) ** 2;
    return 0.1 * Math.sqrt(Math.max(0, q));
  };
  function loft(rings, closed = true) {
    const pos = [], idx = [];
    const m = rings[0].length;
    rings.forEach((r) => r.forEach((p) => pos.push(p[0], p[1], p[2])));
    for (let a = 0; a < rings.length - 1; a++) {
      for (let i = 0; i < (closed ? m : m - 1); i++) {
        const i2 = (i + 1) % m;
        const p0 = a * m + i, p1 = a * m + i2, p2 = (a + 1) * m + i2, p3 = (a + 1) * m + i;
        idx.push(p0, p1, p2, p0, p2, p3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const ring = (scale, z, dy = 0) => outline.map(([x, y]) => [x * scale, MASK_Y + y * scale + dy, z]);
  const skirtBack = outline.map(([x, y]) => {
    const yy = MASK_Y + y * 1.05;
    return [x * 1.05, yy, Math.min(0.093, faceZ(x * 1.05, yy) - 0.002)];
  });
  const skirt = new THREE.Mesh(loft([skirtBack, ring(1.05, 0.098), ring(1.0, 0.1)]),
    std({ color: 0x0b0c0f, roughness: 0.42, side: THREE.DoubleSide }));
  headFrame.add(skirt);
  const frame = new THREE.Mesh(loft([ring(1.0, 0.099), ring(1.0, 0.119), ring(0.93, 0.121), ring(0.86, 0.119), ring(0.86, 0.108)]),
    std({ color: 0x15171b, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }));
  headFrame.add(frame);
  const glassShape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x * 0.86, MASK_Y + y * 0.86)));
  const inner = new THREE.Mesh(new THREE.ShapeGeometry(glassShape), new THREE.MeshBasicMaterial({ color: 0x020406 }));
  inner.position.z = 0.1;
  headFrame.add(inner);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(glassShape), new THREE.MeshPhysicalMaterial({
    color: 0x0c1a24, roughness: 0.03, metalness: 0.0, clearcoat: 1, transparent: true, opacity: 0.55,
    envMapIntensity: 2.2, side: THREE.DoubleSide,
  }));
  glass.position.z = 0.113;
  headFrame.add(glass);
  // Mask strap around the back of the hood.
  {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const ph = THREE.MathUtils.degToRad(68 + (i / 24) * 224);
      pts.push([0.096 * Math.sin(ph) * 0.96, MASK_Y + 0.004, 0.106 * Math.cos(ph) * 0.96]);
    }
    const strap = new THREE.Mesh(strapGeometry(pts, 0.024, 0.004, [0, 1, 0]), std({ color: 0x101114, roughness: 0.5 }));
    headFrame.add(strap);
  }
  {
    const dark = std({ color: 0x15171b, roughness: 0.35 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.032, 0.006), dark);
    bridge.position.set(0, MASK_Y + 0.008, 0.118);
    headFrame.add(bridge);
    for (const sx of [-1, 1]) {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, 0.014), dark);
      bk.position.set(sx * 0.083, MASK_Y + 0.004, 0.088);
      headFrame.add(bk);
    }
  }
  // Second stage in the mouth, exhaust tee below it.
  const reg = new THREE.Group();
  {
    const bodyR = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.037, 0.044, 36), rubber);
    bodyR.rotation.x = Math.PI / 2;
    reg.add(bodyR);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 36), darkPlastic);
    cover.rotation.x = Math.PI / 2;
    cover.position.z = 0.026;
    reg.add(cover);
    const purge = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.008, 28), std({ color: 0x2f6fb5, roughness: 0.35 }));
    purge.rotation.x = Math.PI / 2;
    purge.position.z = 0.034;
    reg.add(purge);
    const tee = new THREE.Mesh(new THREE.CapsuleGeometry(0.0135, 0.058, 6, 18), rubber);
    tee.rotation.z = Math.PI / 2;
    tee.position.set(0, -0.037, -0.006);
    reg.add(tee);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 18), rubber);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = -0.03;
    reg.add(neck);
    reg.position.set(0, -0.07, 0.135);
    headFrame.add(reg);
  }
  const exhaust = new THREE.Object3D();
  exhaust.position.set(0, -0.108, 0.13);
  headFrame.add(exhaust);

  // ---------- hoses (all routed in diver coordinates under the chest bone) ----------
  const regPort = headPoint(-0.04, -0.07, 0.13);
  const octoPos = [0.3, -0.185, 0.12];
  const consolePos = [0.08, -0.1, -0.205];
  const inflatorPos = [0.645, -0.243, -0.165];
  const hoses = [
    { mat: rubber, r: 0.0078, pts: [[0.672, 0.29, 0.06], [0.66, 0.3, 0.14], [0.58, 0.2, 0.2], [0.66, 0.1, 0.205], [0.7, -0.02, 0.15], [0.69, -0.06, 0.07], regPort] },
    { mat: yellowRubber, r: 0.0078, pts: [[0.672, 0.28, 0.06], [0.6, 0.27, 0.16], [0.48, 0.19, 0.228], [0.38, 0.03, 0.238], [0.32, -0.1, 0.2], [octoPos[0], octoPos[1] + 0.02, octoPos[2] + 0.03]] },
    { mat: rubber, r: 0.0078, pts: [[0.666, 0.318, 0.0], [0.62, 0.31, -0.1], [0.55, 0.24, -0.215], [0.4, 0.1, -0.24], [0.22, -0.02, -0.22], [consolePos[0] + 0.03, consolePos[1] + 0.02, consolePos[2]]] },
    { mat: rubber, r: 0.0065, pts: [[0.672, 0.29, -0.02], [0.63, 0.3, -0.12], [0.53, 0.22, -0.2], [0.57, 0.1, -0.255], [0.615, -0.06, -0.26], [0.64, -0.2, -0.205], [inflatorPos[0], inflatorPos[1] + 0.02, inflatorPos[2] - 0.012]] },
  ];
  const chestJ = JOINTS.chest;
  const toChest = (p) => [p[0] - chestJ[0], p[1] - chestJ[1], p[2] - chestJ[2]];
  for (const hz of hoses) {
    const { geometry, curve } = hoseGeometry(hz.pts.map(toChest), hz.r);
    bones.chest.add(new THREE.Mesh(geometry, hz.mat));
    // Strain relief where the hose leaves the first stage.
    const t0 = curve.getTangentAt(0), p0 = curve.getPointAt(0);
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(hz.r * 1.45, hz.r * 1.7, 0.05, 14), hz.mat);
    guard.position.copy(p0).addScaledVector(t0, 0.025);
    guard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t0);
    bones.chest.add(guard);
  }
  // Corrugated BCD inflator hose from the left shoulder to the left hand.
  {
    const pts = [[0.5, 0.185, -0.16], [0.55, 0.12, -0.23], [0.6, -0.02, -0.25], [0.63, -0.16, -0.215], inflatorPos].map(toChest);
    const { geometry, curve } = hoseGeometry(pts, 0.0155, { corrugation: 0.16 });
    bones.chest.add(new THREE.Mesh(geometry, std({ color: 0x1b1d22, roughness: 0.6 })));
    const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
    const inflator = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 6, 16), darkPlastic);
    inflator.position.copy(end).addScaledVector(tan, 0.02);
    inflator.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    bones.chest.add(inflator);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 16), std({ color: 0x2f6fb5, roughness: 0.4 }));
    button.position.copy(inflator.position).add(new THREE.Vector3(0, 0, -0.016));
    button.rotation.x = Math.PI / 2;
    bones.chest.add(button);
  }
  // Octopus (yellow second stage) clipped on the right chest.
  {
    const octo = new THREE.Group();
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 0.04, 32), yellowRubber);
    octo.add(ob);
    const oc = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.012, 32), std({ color: 0xf2d33a, roughness: 0.35 }));
    oc.position.y = -0.025;
    octo.add(oc);
    attach('chest', octo, octoPos);
  }
  // Console with a pressure gauge, hanging at the left hip.
  const consoleCanvas = document.createElement('canvas');
  consoleCanvas.width = consoleCanvas.height = 256;
  const consoleTex = new THREE.CanvasTexture(consoleCanvas);
  consoleTex.colorSpace = THREE.SRGBColorSpace;
  {
    const con = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.03, 40), rubber);
    shell.rotation.x = Math.PI / 2;
    con.add(shell);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.034, 40), new THREE.MeshStandardMaterial({ map: consoleTex, roughness: 0.25, emissive: 0xffffff, emissiveMap: consoleTex, emissiveIntensity: 0.25 }));
    face.position.z = -0.0155;
    face.rotation.y = Math.PI;
    con.add(face);
    attach('spine', con, consolePos);
  }

  // ---------- weight belt ----------
  {
    const BX = 0.035;
    const pts = [];
    const ringPts = [];
    for (let i = 0; i < 40; i++) {
      const ph = (i / 40) * Math.PI * 2;
      const dir = [0, Math.cos(ph), Math.sin(ph)];
      const origin = [BX, dir[1] * 0.4, dir[2] * 0.4];
      const t = raySurface(bodyField.distance, origin, [0, -dir[1], -dir[2]], 0.4);
      const p = [BX, origin[1] - dir[1] * (t - 0.007), origin[2] - dir[2] * (t - 0.007)];
      pts.push(p);
      ringPts.push({ ph, p, dir });
    }
    const belt = new THREE.Mesh(strapGeometry(pts, 0.05, 0.006, [1, 0, 0], true), webbing);
    attach('pelvis', belt);
    const leadMat = std({ color: 0x4e5257, roughness: 0.62, metalness: 0.35 });
    const pick = (ph) => ringPts.reduce((a, b) => (Math.abs(Math.atan2(Math.sin(b.ph - ph), Math.cos(b.ph - ph))) < Math.abs(Math.atan2(Math.sin(a.ph - ph), Math.cos(a.ph - ph))) ? b : a));
    for (const ph of [1.95, 1.35, -1.95, -1.35]) {
      const { p, dir } = pick(((ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.042, 0.022), leadMat);
      lead.position.set(p[0], p[1] + dir[1] * 0.012, p[2] + dir[2] * 0.012);
      lead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, dir[1], dir[2]));
      bones.pelvis.add(lead);
    }
    const { p, dir } = pick(Math.PI);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.045), chrome);
    buckle.position.set(p[0], p[1] + dir[1] * 0.006, p[2]);
    bones.pelvis.add(buckle);
  }

  // ---------- fins ----------
  const finMat = phys({ color: 0x1d4c96, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  const fins = [];
  for (const side of ['L', 'R']) {
    const A = new THREE.Vector3(...JOINTS['foot_' + side]);
    const T = new THREE.Vector3(...TOES[side]);
    const along = T.clone().sub(A).normalize();
    const lateral = new THREE.Vector3(0, 1, 0).cross(along).normalize();
    const up = along.clone().cross(lateral).normalize();
    const half = [[0.0, 0.0], [0.0, 0.045], [0.05, 0.058], [0.22, 0.062], [0.4, 0.088], [0.57, 0.11], [0.63, 0.106], [0.655, 0.07], [0.648, 0.028], [0.64, 0.0]];
    const shape = new THREE.Shape();
    shape.moveTo(half[0][0], half[0][1]);
    half.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
    half.slice(0, -1).reverse().forEach(([x, y]) => shape.lineTo(x, -y));
    const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4, steps: 1 });
    blade.translate(0, 0, -0.004);
    const halfAt = (x) => {
      for (let i = 1; i < half.length; i++) {
        const [x0, y0] = half[i - 1], [x1, y1] = half[i];
        if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-6, x1 - x0);
      }
      return half[half.length - 1][1];
    };
    const parts = [blade];
    for (const sg of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const x = 0.13 + (i / 12) * 0.47;
        pts.push(new THREE.Vector3(x, sg * (halfAt(x) - 0.008), 0.0075));
      }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0045, 6, false).toNonIndexed());
    }
    const finGeo = mergeGeometries(parts.map((g) => {
      g.clearGroups();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    }));
    // Densify along the length so the blade can bend smoothly.
    const pos = finGeo.attributes.position;
    const bent = new Float32Array(pos.array.length);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const b = x > 0.22 ? -0.22 * (x - 0.22) ** 2 * 2.2 : 0;
      bent[i * 3] = 0; bent[i * 3 + 1] = 0; bent[i * 3 + 2] = b;
    }
    finGeo.morphAttributes.position = [new THREE.BufferAttribute(bent, 3)];
    finGeo.morphTargetsRelative = true;
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.morphTargetInfluences = [0];
    const basis = new THREE.Matrix4().makeBasis(along, lateral, up);
    fin.setRotationFromMatrix(basis);
    const origin = A.clone().addScaledVector(along, -0.05).addScaledVector(up, -0.012);
    attach('foot_' + side, fin, origin.toArray());
    // Foot pocket around the boot.
    const pocket = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.19, 6, 20), std({ color: 0x0d0e11, roughness: 0.5 }));
    pocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    const pc = A.clone().addScaledVector(along, 0.1);
    attach('foot_' + side, pocket, pc.toArray());
    fins.push(fin);
  }

  // ---------- dive computer on the left wrist ----------
  const compCanvas = document.createElement('canvas');
  compCanvas.width = compCanvas.height = 256;
  const compTex = new THREE.CanvasTexture(compCanvas);
  compTex.colorSpace = THREE.SRGBColorSpace;
  {
    const E = new THREE.Vector3(...JOINTS.foreArm_L), W = new THREE.Vector3(...JOINTS.hand_L);
    const d = W.clone().sub(E).normalize();
    const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, d).normalize();
    const centre = W.clone().addScaledVector(d, -0.05);
    const comp = new THREE.Group();
    const yUp = new THREE.Vector3(0, 1, 0);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.029, 0.014, 32), std({ color: 0x1a1d22, roughness: 0.4, metalness: 0.2 }));
    housing.quaternion.setFromUnitVectors(yUp, up);
    comp.add(housing);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0255, 0.0024, 8, 32), chromeEarly);
    bezel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    bezel.position.copy(up).multiplyScalar(0.0072);
    comp.add(bezel);
    const screen = new THREE.Mesh(new THREE.CircleGeometry(0.0215, 32), new THREE.MeshStandardMaterial({ map: compTex, emissive: 0xffffff, emissiveMap: compTex, emissiveIntensity: 0.6, roughness: 0.2 }));
    screen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    screen.position.copy(up).multiplyScalar(0.0074);
    comp.add(screen);
    comp.position.copy(up).multiplyScalar(0.046);
    const mount = new THREE.Group();
    mount.add(comp);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.0345, 0.0035, 8, 36), std({ color: 0x121417, roughness: 0.6 }));
    strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    strap.scale.set(1, 1, 2.6);
    mount.add(strap);
    attach('foreArm_L', mount, centre.toArray());
  }
  function drawComputer(depth, seconds) {
    const c = compCanvas.getContext('2d');
    c.fillStyle = '#0b1015'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#7fdcff'; c.font = 'bold 30px Arial'; c.textAlign = 'center';
    c.fillText('DEPTH', 128, 70);
    c.fillStyle = '#ffffff'; c.font = 'bold 76px Arial';
    c.fillText(depth.toFixed(1), 128, 148);
    c.fillStyle = '#9fb0bd'; c.font = 'bold 26px Arial';
    const m = Math.floor(seconds / 60), sec = Math.floor(seconds % 60);
    c.fillText('m   ' + m + ':' + String(sec).padStart(2, '0'), 128, 192);
    compTex.needsUpdate = true;
  }
  drawComputer(0, 0);

  // ---------- X-ray: air spaces ----------
  const airGlow = glowMaterial(0x5ee7ff);
  const lungsGeo = fieldGeometry(lungPrims(), 0.0085).geometry;
  const lungs = new THREE.Mesh(lungsGeo, airGlow);
  lungs.renderOrder = 6;
  const lungPivot = new THREE.Group();
  lungPivot.add(lungs);
  lungs.position.set(-0.36, -0.03, 0);
  attach('chest', lungPivot, [0.36, 0.03, 0]);
  const ghost = new THREE.Mesh(lungsGeo, glowMaterial(0xff5b4a));
  ghost.renderOrder = 7;
  const ghostPivot = new THREE.Group();
  ghostPivot.add(ghost);
  ghost.position.set(-0.36, -0.03, 0);
  attach('chest', ghostPivot, [0.36, 0.03, 0]);
  const headAir = [];
  for (const a of HEAD_AIR) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), airGlow);
    m.scale.set(a.r[0], a.r[1], a.r[2]);
    m.position.set(a.s, a.u, a.f);
    m.renderOrder = 6;
    headFrame.add(m);
    headAir.push(m);
  }
  const maskAir = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), airGlow);
  maskAir.scale.set(0.062, 0.028, 0.006);
  maskAir.position.set(0, MASK_Y, 0.106);
  maskAir.renderOrder = 6;
  headFrame.add(maskAir);

  // Anchors for screen labels, in diver space.
  const anchors = {
    lungs: lungPivot,
    sinus: headAir[2],
    ear: headAir[4],
    mask: maskAir,
    bcd: (() => { const o = new THREE.Object3D(); attach('chest', o, [0.32, 0.22, -0.2]); return o; })(),
    belt: (() => { const o = new THREE.Object3D(); attach('pelvis', o, [0.035, 0.12, 0]); return o; })(),
    head: headFrame,
  };

  // ---------- state ----------
  const state = { inflation: 0.5, xray: 0, kickAmp: 0, kickPhase: 0, breath: 0, ghost: 0, ghostScale: 1 };
  let lastConsole = -1;

  function drawConsole(depth, tankBar) {
    const c = consoleCanvas.getContext('2d');
    const W = 256;
    c.fillStyle = '#e9eef2';
    c.fillRect(0, 0, W, W);
    c.strokeStyle = '#1a1c20';
    c.lineWidth = 6;
    c.beginPath(); c.arc(W / 2, W / 2, 118, 0, Math.PI * 2); c.stroke();
    // Pressure scale 0-300 bar over 270 degrees.
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
    c.lineWidth = 3;
    for (let b = 0; b <= 300; b += 25) {
      const a = a0 + (b / 300) * span;
      const r1 = b % 50 === 0 ? 92 : 100;
      c.beginPath();
      c.moveTo(W / 2 + Math.cos(a) * r1, W / 2 + Math.sin(a) * r1);
      c.lineTo(W / 2 + Math.cos(a) * 110, W / 2 + Math.sin(a) * 110);
      c.stroke();
    }
    c.strokeStyle = '#c62828';
    c.lineWidth = 10;
    c.beginPath(); c.arc(W / 2, W / 2, 104, a0, a0 + (50 / 300) * span); c.stroke();
    c.fillStyle = '#1a1c20';
    c.font = 'bold 26px Arial';
    c.textAlign = 'center';
    c.fillText('BAR', W / 2, W / 2 + 62);
    c.font = 'bold 34px Arial';
    c.fillText(depth.toFixed(1) + ' m', W / 2, W / 2 + 100);
    const a = a0 + (Math.min(300, tankBar) / 300) * span;
    c.strokeStyle = '#111';
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(W / 2 + Math.cos(a) * 88, W / 2 + Math.sin(a) * 88); c.stroke();
    c.beginPath(); c.arc(W / 2, W / 2, 10, 0, Math.PI * 2); c.fill();
    consoleTex.needsUpdate = true;
  }
  drawConsole(0, 200);

  function update(p) {
    Object.assign(state, p);
    bcd.morphTargetInfluences[0] = state.inflation;
    bcdGlow.morphTargetInfluences[0] = state.inflation;
    for (const m of strapMeshes) m.morphTargetInfluences[0] = state.inflation;
    for (const h of hardware) {
      h.obj.position.lerpVectors(h.a.pos, h.b.pos, state.inflation);
      h.obj.quaternion.slerpQuaternions(h.a.q, h.b.q, state.inflation);
    }
    // Gentle frog-kick style motion.
    const k = state.kickAmp, ph = state.kickPhase;
    for (const [side, sgn] of [['L', -1], ['R', 1]]) {
      bones['thigh_' + side].rotation.y = sgn * k * 0.18 * Math.sin(ph);
      bones['thigh_' + side].rotation.z = k * 0.08 * Math.sin(ph + 0.6);
      bones['shin_' + side].rotation.z = -k * 0.32 * Math.sin(ph + 1.1);
      bones['foot_' + side].rotation.z = k * 0.25 * Math.sin(ph + 1.7) + 0.04 * Math.sin(ph * 0.5);
    }
    for (const f of fins) f.morphTargetInfluences[0] = k * 0.9 * Math.cos(ph + 1.5) + 0.15 * Math.sin(ph * 0.7);
    // X-ray: fade the suit and BCD, light up the air spaces.
    const x = state.xray;
    bodyMat.opacity = 1 - 0.86 * x;
    bodyMat.depthWrite = x < 0.02;
    bcdMat.opacity = 1 - 0.9 * x;
    bcdMat.depthWrite = x < 0.02;
    bcdGlow.material.opacity = 0.16 * x;
    for (const m of tankParts) {
      m.opacity = 1 - 0.65 * x;
      m.depthWrite = x < 0.02;
    }
    airGlow.uniforms.uOpacity.value = x;
    lungPivot.scale.setScalar(1 + 0.045 * state.breath);
    ghost.material.uniforms.uOpacity.value = state.ghost;
    ghostPivot.scale.setScalar(state.ghostScale);
    if (p.depth !== undefined && Math.abs(p.depth - lastConsole) > 0.1) {
      lastConsole = p.depth;
      drawConsole(p.depth, p.tankBar ?? 200);
      drawComputer(p.depth, p.diveTime ?? 0);
    }
  }

  group.traverse((o) => {
    if (o.isMesh && !(o.material && (o.material.isShaderMaterial || o.material.isMeshBasicMaterial))) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  glass.castShadow = false;

  return { group, bones, update, anchors, exhaust, state };
}
