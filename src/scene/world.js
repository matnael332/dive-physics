// The dive site: water, light, surface, reef wall, sand, descent line, plankton and bubbles.
import * as THREE from 'three';
import { addCaustics, CAUSTICS } from './caustics.js';
import { bubbleMaterial } from './materials.js';
import { pressureAt } from '../physics.js';

export const LINE = { x: 2.2, z: 1.2 };
export const SEABED_Y = -36;

// ---------- small noise helpers (deterministic) ----------
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// ---------- water optics ----------
const STOPS = [
  [0, new THREE.Color('#2ea6c6')],
  [6, new THREE.Color('#1c88b0')],
  [15, new THREE.Color('#126792')],
  [30, new THREE.Color('#0a4166')],
  [45, new THREE.Color('#062a47')],
];
export function waterColor(depth, out = new THREE.Color()) {
  const d = Math.max(0, depth);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [d0, c0] = STOPS[i], [d1, c1] = STOPS[i + 1];
    if (d <= d1) return out.copy(c0).lerp(c1, (d - d0) / (d1 - d0));
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}
// Fraction of red, green and blue sunlight left after travelling `depth` metres down (approximate).
export const ABSORB = [0.3, 0.065, 0.032];
export function lightAt(depth, out = new THREE.Color()) {
  const d = Math.max(0, depth);
  return out.setRGB(Math.exp(-ABSORB[0] * d), Math.exp(-ABSORB[1] * d), Math.exp(-ABSORB[2] * d));
}

// Tileable value-noise texture (used as a bump map for rock and coral).
function noiseTexture(size, period, s0) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = (x, y, p, o) => hash2(((x % p) + p) % p + o * 17.3, ((y % p) + p) % p + o * 5.1);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let v = 0, a = 0.5;
      for (let o = 0, p = period; o < 4; o++, p *= 2) {
        const fx = (i / size) * p, fy = (j / size) * p;
        const xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
        const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
        const n = h(xi, yi, p, o + s0) * (1 - u) * (1 - w) + h(xi + 1, yi, p, o + s0) * u * (1 - w)
          + h(xi, yi + 1, p, o + s0) * (1 - u) * w + h(xi + 1, yi + 1, p, o + s0) * u * w;
        v += n * a;
        a *= 0.5;
      }
      const k = (j * size + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(v * 255 / 0.94);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// A branching sea fan drawn on a transparent canvas.
function seaFanTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d');
  c.strokeStyle = '#fff';
  c.lineCap = 'round';
  function branch(x, y, ang, len, w, depthLeft) {
    if (depthLeft === 0 || len < 6) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    c.lineWidth = w;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    branch(x2, y2, ang - 0.32 - rand() * 0.2, len * 0.8, w * 0.75, depthLeft - 1);
    branch(x2, y2, ang + 0.32 + rand() * 0.2, len * 0.8, w * 0.75, depthLeft - 1);
  }
  branch(256, 500, -Math.PI / 2, 90, 9, 8);
  c.globalAlpha = 0.5;
  c.lineWidth = 1.5;
  for (let i = 0; i < 260; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.4, r = 60 + rand() * 330;
    c.beginPath();
    c.moveTo(256 + Math.cos(a) * r, 500 + Math.sin(a) * r);
    c.lineTo(256 + Math.cos(a + 0.08) * (r + 20), 500 + Math.sin(a + 0.08) * (r + 20));
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function finishShader(src) {
  return src.replace('/*FINISH*/', '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n');
}

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0x1c88b0, 0.042);
  scene.fog = fog;

  // Environment map for reflections on the tank, mask and chrome parts.
  {
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vD; void main(){
          float y = vD.y;
          vec3 top = vec3(2.4, 2.9, 3.0), mid = vec3(0.08, 0.32, 0.45), low = vec3(0.01, 0.05, 0.09);
          vec3 c = y > 0.0 ? mix(mid, top, pow(y, 1.4)) : mix(mid, low, pow(-y, 0.6));
          c += vec3(6.0) * pow(max(y, 0.0), 40.0);
          gl_FragColor = vec4(c, 1.0); }`,
      })
    );
    envScene.add(dome);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
  }

  // Lights.
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(3, 20, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9fe3ff, 0x08263a, 1.2);
  scene.add(hemi);

  // Background dome that follows the camera.
  const skyUniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: finishShader(`uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; varying vec3 vD;
        void main(){ float y = vD.y;
          vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.7)) : mix(uHorizon, uBottom, pow(-y, 0.55));
          gl_FragColor = vec4(c, 1.0); /*FINISH*/ }`),
    })
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Water surface seen from below, with Snell's window.
  const surfUniforms = {
    uTime: CAUSTICS.uTime,
    uSky: { value: new THREE.Color() },
    uRefl: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uFogD: { value: 0.02 },
  };
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: surfUniforms,
      side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: finishShader(`uniform float uTime; uniform vec3 uSky; uniform vec3 uRefl; uniform vec3 uFog; uniform float uFogD; varying vec3 vW;
        float wave(vec2 p){
          return sin(p.x*1.3+uTime*1.1)*0.5 + sin(p.y*1.7-uTime*0.9)*0.5 + sin((p.x*0.8-p.y)*2.3+uTime*1.7)*0.3
               + sin((p.x+p.y*0.6)*4.1-uTime*2.3)*0.12; }
        void main(){
          vec3 V = normalize(vW - cameraPosition);
          vec2 p = vW.xz; float e = 0.04;
          float hx = (wave(p+vec2(e,0.0)) - wave(p-vec2(e,0.0))) / (2.0*e);
          float hz = (wave(p+vec2(0.0,e)) - wave(p-vec2(0.0,e))) / (2.0*e);
          vec3 N = normalize(vec3(-hx*0.02, 1.0, -hz*0.02));
          float cosT = dot(V, N);
          float win = smoothstep(0.52, 0.76, cosT);
          float slope = clamp(length(vec2(hx, hz)) * 0.25, 0.0, 1.0);
          vec3 col = mix(uRefl * (0.9 + 0.12*slope), uSky * (0.75 + 0.45*slope), win);
          float dist = length(vW - cameraPosition);
          col = mix(col, uFog, 1.0 - exp(-pow(uFogD*dist, 2.0)));
          gl_FragColor = vec4(col, 1.0); /*FINISH*/ }`),
    })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0;
  scene.add(surface);

  // God rays: soft light shafts from the surface.
  const rayCount = 16;
  const rayGeo = new THREE.BufferGeometry();
  {
    const top = [], corner = [], width = [], seedA = [], idx = [];
    for (let i = 0; i < rayCount; i++) {
      const x = (rand() - 0.5) * 30, z = (rand() - 0.5) * 30, w = 0.5 + rand() * 1.8, s = rand();
      for (const [a, b] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        top.push(x, 0, z); corner.push(a, b); width.push(w); seedA.push(s);
      }
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    rayGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    rayGeo.setAttribute('aWidth', new THREE.Float32BufferAttribute(width, 1));
    rayGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedA, 1));
    rayGeo.setIndex(idx);
  }
  const rayUniforms = { uTime: CAUSTICS.uTime, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() }, uIntensity: { value: 0.1 } };
  const rays = new THREE.Mesh(rayGeo, new THREE.ShaderMaterial({
    uniforms: rayUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aCorner; attribute float aWidth; attribute float aSeed;
      uniform vec3 uCam; uniform float uTime;
      varying float vAlong; varying float vSide; varying float vSeed; varying float vDist; varying float vFace;
      void main(){
        vec3 axis = normalize(vec3(0.12, -1.0, 0.06));
        vec3 top = position;
        top.xz = mod(top.xz - uCam.xz + 15.0, 30.0) - 15.0 + uCam.xz;
        top.x += sin(uTime*0.07 + aSeed*12.0) * 1.5;
        float len = 46.0;
        vec3 p = top + axis * aCorner.y * len;
        vec3 side = normalize(cross(axis, normalize(cameraPosition - p)));
        p += side * aCorner.x * aWidth * (1.0 + aCorner.y * 1.6);
        vAlong = aCorner.y; vSide = aCorner.x; vSeed = aSeed; vDist = length(cameraPosition - p);
        vFace = 1.0 - abs(dot(normalize(cameraPosition - p), axis));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
      varying float vAlong; varying float vSide; varying float vSeed; varying float vDist; varying float vFace;
      void main(){
        float a = pow(1.0 - vAlong, 1.8) * pow(1.0 - abs(vSide), 1.6) * smoothstep(0.0, 0.25, vAlong) * vFace * vFace;
        a *= 0.55 + 0.45 * sin(uTime * 0.6 + vSeed * 20.0);
        a *= exp(-vDist / 28.0) * smoothstep(2.0, 7.0, vDist) * uIntensity;
        a = min(a, 0.3);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  }));
  rays.frustumCulled = false;
  scene.add(rays);

  // Plankton / marine snow: drifting particles that wrap around the camera.
  const PCOUNT = 2600, BOX = 22;
  const pGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(PCOUNT * 3), sd = new Float32Array(PCOUNT);
    for (let i = 0; i < PCOUNT; i++) {
      pos[i * 3] = rand() * BOX; pos[i * 3 + 1] = rand() * BOX; pos[i * 3 + 2] = rand() * BOX;
      sd[i] = rand();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  }
  const pUniforms = {
    uTime: CAUSTICS.uTime, uCam: { value: new THREE.Vector3() }, uScale: { value: 1000 },
    uColor: { value: new THREE.Color() }, uBox: { value: BOX },
  };
  const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
    uniforms: pUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float aSeed; uniform vec3 uCam; uniform float uTime; uniform float uScale; uniform float uBox;
      varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime*0.13 + aSeed*6.0)*0.4, uTime*0.025*(0.4+aSeed), cos(uTime*0.11 + aSeed*4.0)*0.4);
        p = mod(p - uCam + uBox*0.5, uBox) - uBox*0.5 + uCam;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = max(-mv.z, 0.05);
        gl_PointSize = clamp((0.006 + 0.012*aSeed) * uScale / d, 1.0, 14.0);
        vA = clamp(1.0 - d / (uBox*0.5), 0.0, 1.0) * smoothstep(0.3, 1.2, d) * (0.35 + 0.65*aSeed);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: finishShader(`uniform vec3 uColor; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, r) * vA * 0.7;
        gl_FragColor = vec4(uColor, a); /*FINISH*/ }`),
  }));
  particles.frustumCulled = false;
  scene.add(particles);

  // Descent line with depth tags, surface buoy and bottom weight.
  const ropeMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0xb8a37a, roughness: 0.95 }));
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, -SEABED_Y, 8, 1), ropeMat);
  rope.position.set(LINE.x, SEABED_Y / 2, LINE.z);
  scene.add(rope);
  const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 16), addCaustics(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.4 })));
  buoy.position.set(LINE.x, 0.08, LINE.z);
  scene.add(buoy);
  for (let d = 5; d <= 35; d += 5) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#d24a1a'; c.fillRect(0, 0, 256, 26); c.fillRect(0, 134, 256, 26);
    c.fillStyle = '#16181c'; c.font = 'bold 86px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(d + ' m', 128, 82);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const side = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 });
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.125, 0.008), [side, side, side, side, front, front]);
    tag.position.set(LINE.x, -d, LINE.z - 0.02);
    tag.rotation.y = Math.PI + 0.25;
    scene.add(tag);
  }
  const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), addCaustics(new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.8 })));
  anchor.position.set(LINE.x, SEABED_Y + 0.15, LINE.z);
  scene.add(anchor);

  // Reef wall behind the line.
  const WALL_Z = 8.5;
  const wallAt = (x, y) => {
    const big = fbm(x * 0.05 + 3, y * 0.05, 4);
    const detail = fbm(x * 0.45, y * 0.45, 5);
    const bumps = fbm(x * 1.6 + 9, y * 1.6, 3);
    let z = WALL_Z - big * 4.5 - detail * 1.4 - bumps * 0.25;
    const top = -6 + (fbm(x * 0.12 + 7, 1.3, 3) - 0.5) * 2.5;
    if (y > top) z += (y - top) ** 2 * 7;
    if (y < -31) z -= (-31 - y) * 0.9;
    return { z, detail, bumps };
  };
  const rockBump = noiseTexture(256, 16, 11);
  rockBump.repeat.set(36, 18);
  {
    const geo = new THREE.PlaneGeometry(96, 48, 320, 160);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const rock = new THREE.Color('#4d483f'), tmp = new THREE.Color();
    const tints = ['#5d4b5e', '#4f5c47', '#7a5b41', '#6b5560', '#6a6340', '#455a63'].map((h) => new THREE.Color(h));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) - 22;
      const { z, detail, bumps } = wallAt(x, y);
      pos.setXYZ(i, x, y, z);
      const coral = fbm(x * 0.7 + 50, y * 0.7, 4);
      tmp.copy(rock).multiplyScalar(0.6 + detail * 0.55);
      if (coral > 0.56) tmp.lerp(tints[Math.floor(hash2(Math.floor(x * 0.9), Math.floor(y * 0.9)) * tints.length)], Math.min(0.65, (coral - 0.56) * 3));
      tmp.multiplyScalar(0.65 + bumps * 0.5);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const index = geo.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t;
    }
    geo.computeVertexNormals();
    const wall = new THREE.Mesh(geo, addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, bumpMap: rockBump, bumpScale: 3 })));
    scene.add(wall);
  }
  // Coral heads and sea fans growing on the wall.
  {
    const coralMat = addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, bumpMap: rockBump, bumpScale: 4 }));
    const palette = ['#7d6a52', '#6f5a6f', '#5f6f52', '#8a6a4a', '#6d6658', '#9a8a6a'].map((h) => new THREE.Color(h));
    for (let i = 0; i < 70; i++) {
      const x = (rand() - 0.5) * 34, y = -6 - rand() * 29.5;
      const { z } = wallAt(x, y);
      const r = 0.2 + rand() * 0.55;
      const g = new THREE.SphereGeometry(r, 28, 18);
      const p = g.attributes.position;
      const c = new Float32Array(p.count * 3);
      const base = palette[i % palette.length];
      const v = new THREE.Vector3(), tmp = new THREE.Color();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const s = 1 + (fbm(v.x * 4 / r + i, v.y * 4 / r + v.z * 3 / r, 4) - 0.5) * 0.7;
        v.multiplyScalar(s);
        v.z *= 0.55;
        p.setXYZ(k, v.x, v.y, v.z);
        tmp.copy(base).multiplyScalar(0.7 + 0.5 * s - 0.3);
        c[k * 3] = tmp.r; c[k * 3 + 1] = tmp.g; c[k * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, coralMat);
      m.position.set(x, y, z - r * 0.12);
      m.rotation.z = rand() * 6;
      scene.add(m);
    }
    const fanTex = seaFanTexture();
    const fanMats = ['#7a4f7c', '#9a5a4a', '#8a7a4a'].map((h) => addCaustics(new THREE.MeshStandardMaterial({
      color: h, map: fanTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9,
    })));
    for (let i = 0; i < 22; i++) {
      const x = (rand() - 0.5) * 30, y = -7 - rand() * 27;
      const { z } = wallAt(x, y);
      const sz = 0.6 + rand() * 1.1;
      const fan = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), fanMats[i % fanMats.length]);
      fan.position.set(x, y + sz * 0.42, z - 0.25);
      fan.rotation.y = Math.PI + (rand() - 0.5) * 0.7;
      fan.rotation.z = (rand() - 0.5) * 0.4;
      scene.add(fan);
    }
  }

  // Sandy bottom with ripples, rising toward the wall, and scattered rocks.
  {
    const geo = new THREE.PlaneGeometry(150, 150, 240, 240);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color('#bba985'), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = fbm(x * 0.08, z * 0.08, 4);
      const ripple = Math.sin(x * 4.2 + fbm(x * 0.3, z * 0.3, 3) * 6) * 0.03;
      const y = SEABED_Y + n * 1.4 - 0.5 + ripple + Math.max(0, z - 3) * 0.32;
      pos.setY(i, y);
      tmp.copy(sand).multiplyScalar(0.7 + fbm(x * 0.6 + 4, z * 0.6, 3) * 0.5);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))));
    const rockMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x544c42, roughness: 0.95, flatShading: false }));
    for (let i = 0; i < 26; i++) {
      const r = 0.3 + rand() * 1.2;
      const g = new THREE.IcosahedronGeometry(r, 3);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, k);
        const s = 1 + (fbm(v.x * 2 + i, v.y * 2 + v.z, 3) - 0.5) * 0.7;
        v.multiplyScalar(s);
        v.y *= 0.6;
        p.setXYZ(k, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, rockMat);
      const x = (rand() - 0.5) * 24, z = (rand() - 0.5) * 12 + 1;
      m.position.set(x, SEABED_Y - 0.3 + Math.max(0, z - 3) * 0.32, z);
      m.rotation.y = rand() * 6;
      scene.add(m);
    }
  }

  // Exhaled bubbles: they rise, wobble and grow as the pressure drops (Boyle's law).
  const MAXB = 480;
  const bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), bubbleMaterial(), MAXB);
  bubbleMesh.frustumCulled = false;
  bubbleMesh.count = 0;
  scene.add(bubbleMesh);
  const bubbles = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), bp = new THREE.Vector3();
  function emitBubbles(at, count) {
    for (let i = 0; i < count && bubbles.length < MAXB; i++) {
      const big = rand() < 0.18;
      bubbles.push({
        x: at.x + (rand() - 0.5) * 0.03, y: at.y - rand() * 0.02, z: at.z + (rand() - 0.5) * 0.05,
        r0: big ? 0.008 + rand() * 0.012 : 0.0025 + rand() * 0.004,
        p0: pressureAt(-at.y), age: -rand() * 0.6, ph: rand() * 6.28, w: 4 + rand() * 6,
      });
    }
  }
  function updateBubbles(dt) {
    let n = 0;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;
      if (b.age < 0) continue;
      const r = b.r0 * Math.cbrt(b.p0 / pressureAt(-b.y));
      const v = Math.min(0.34, 0.16 + r * 9);
      b.y += v * dt;
      b.x += Math.sin(b.age * b.w + b.ph) * 0.05 * dt;
      b.z += Math.cos(b.age * b.w * 0.8 + b.ph) * 0.05 * dt;
      if (b.y > -0.03 || b.age > 14) {
        bubbles.splice(i, 1);
        continue;
      }
      const flat = r > 0.007 ? 0.68 : 1;
      sc.set(r, r * flat, r);
      bp.set(b.x, b.y, b.z);
      m4.compose(bp, q, sc);
      bubbleMesh.setMatrixAt(n++, m4);
    }
    bubbleMesh.count = n;
    bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- per-frame update from the current depth ----------
  const cA = new THREE.Color(), cB = new THREE.Color();
  function update(depth, camera, dt, viewportHeight, focus) {
    const camDepth = Math.max(0.2, -camera.position.y);
    const light = lightAt(depth, cA);
    waterColor(camDepth, fog.color);
    fog.density = 0.036 + Math.min(camDepth, 40) * 0.00035;
    skyUniforms.uHorizon.value.copy(fog.color);
    waterColor(Math.max(0, camDepth - 14), skyUniforms.uTop.value).multiplyScalar(1.7);
    waterColor(camDepth + 30, skyUniforms.uBottom.value).multiplyScalar(0.45);
    sun.color.copy(light);
    sun.intensity = 3.4;
    const fx = focus ? focus.x : camera.position.x, fy = focus ? focus.y : -depth, fz = focus ? focus.z : camera.position.z;
    sun.position.set(fx + 2.2, fy + 18, fz - 3);
    sun.target.position.set(fx, fy, fz);
    waterColor(Math.max(0, depth - 10), hemi.color).multiplyScalar(1.15);
    waterColor(depth + 18, hemi.groundColor).multiplyScalar(0.55);
    hemi.intensity = 1.5;
    scene.environmentIntensity = 0.25 + 0.75 * Math.exp(-depth / 14);
    renderer.toneMappingExposure = Math.min(2.2, 1.0 + depth * 0.032);
    CAUSTICS.uCausticStrength.value = 0.9 * Math.exp(-depth / 7);
    CAUSTICS.uCausticColor.value.copy(light).lerp(cB.setRGB(0.6, 0.9, 1), 0.3);
    lightAt(camDepth, surfUniforms.uSky.value).multiplyScalar(4.2);
    surfUniforms.uSky.value.lerp(cB.setRGB(3.4, 3.9, 4.1), Math.exp(-camDepth / 4) * 0.6);
    waterColor(camDepth + 6, surfUniforms.uRefl.value).multiplyScalar(0.75);
    surfUniforms.uFog.value.copy(fog.color);
    surfUniforms.uFogD.value = fog.density * 0.85;
    surface.position.x = camera.position.x;
    surface.position.z = camera.position.z;
    sky.position.copy(camera.position);
    rayUniforms.uCam.value.copy(camera.position);
    rayUniforms.uColor.value.copy(light).lerp(cB.setRGB(0.7, 0.95, 1), 0.5);
    rayUniforms.uIntensity.value = 0.32 * Math.exp(-camDepth / 13);
    pUniforms.uCam.value.copy(camera.position);
    pUniforms.uScale.value = (viewportHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    waterColor(Math.max(0, camDepth - 20), pUniforms.uColor.value).lerp(cB.setRGB(0.9, 0.95, 1), 0.55);
    updateBubbles(dt);
  }

  return { scene, update, emitBubbles, sun };
}
