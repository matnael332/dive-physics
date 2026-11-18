// Surface detail for the diver, computed in the fragment shader so edges stay sharp:
// wetsuit panels and seams, knee pads, gloves, the hood's face opening, a fine fabric grain,
// and quilted welds on the BCD bladder. Composes with the caustics injection.
import * as THREE from 'three';
import { JOINTS, HEAD } from '../diverShape.js';

const COMMON = /* glsl */ `
float dHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Bump mapping from a height field using screen-space derivatives.
vec3 dBump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
// A line of half-width w around d == 0, never thinner than about one pixel.
float dLine(float d, float w) {
  float aa = max(w, fwidth(d) * 1.2);
  return 1.0 - smoothstep(aa * 0.5, aa, abs(d));
}
// Fabric grain that fades out before it can shimmer.
float dGrain(vec3 p, float f1) {
  float fp = length(fwidth(p));
  float fade = 1.0 - smoothstep(0.7 / f1, 2.0 / f1, fp);
  return (dNoise(p * f1) * 0.65 + dNoise(p * f1 * 2.3) * 0.35) * fade;
}
`;

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function chain(material, key, inject) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    inject(shader);
  };
  material.customProgramCacheKey = () => prevKey + '|' + key;
}

// Wetsuit on the skinned body. Regions are found from the bind-pose position and normal
// (not from bone indices, which cannot be interpolated), so every edge stays smooth.
export function addWetsuitDetail(material) {
  const pair = (l, r) => ({ value: [v3(JOINTS[l]), v3(JOINTS[r])] });
  const uniforms = {
    uHip: pair('thigh_L', 'thigh_R'),
    uKnee: pair('shin_L', 'shin_R'),
    uElbow: pair('foreArm_L', 'foreArm_R'),
    uWrist: pair('hand_L', 'hand_R'),
    uHeadC: { value: v3(HEAD.C) },
    uHeadU: { value: v3(HEAD.U) },
    uHeadF: { value: v3(HEAD.F) },
    uHeadS: { value: v3(HEAD.S) },
    uBump: { value: 1.0 },
  };
  chain(material, 'wetsuit-v2', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBindPos;\nvarying vec3 vBindNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindPos = position;\nvBindNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${COMMON}
uniform vec3 uHip[2]; uniform vec3 uKnee[2]; uniform vec3 uElbow[2]; uniform vec3 uWrist[2];
uniform vec3 uHeadC; uniform vec3 uHeadU; uniform vec3 uHeadF; uniform vec3 uHeadS;
uniform float uBump;
varying vec3 vBindPos; varying vec3 vBindNrm;
float segT(vec3 p, vec3 a, vec3 b, out float r) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  r = length(p - (a + ab * t));
  return t;
}
vec3 suitShade(out float h) {
  vec3 p = vBindPos;
  vec3 n = normalize(vBindNrm);
  bool right = p.z > 0.0;
  float side = right ? 1.0 : -1.0;
  vec3 hip = right ? uHip[1] : uHip[0];
  vec3 knee = right ? uKnee[1] : uKnee[0];
  vec3 elbow = right ? uElbow[1] : uElbow[0];
  vec3 wrist = right ? uWrist[1] : uWrist[0];
  vec3 col = vec3(0.0062, 0.0068, 0.0082);
  h = dGrain(p, 420.0) * 0.00022;
  // A narrow coloured panel down the outside of each thigh, edged by a seam.
  float r;
  float t = segT(p, hip, knee, r);
  float thigh = (1.0 - smoothstep(0.1, 0.12, r)) * smoothstep(0.1, 0.18, t) * (1.0 - smoothstep(0.84, 0.92, t));
  float c = n.z * side;
  col = mix(col, vec3(0.016, 0.08, 0.25), smoothstep(0.958, 0.964, c) * thigh);
  float s1 = dLine(c - 0.961, 0.0045) * thigh;
  col *= 1.0 - 0.55 * s1;
  h -= s1 * 0.0006;
  // Knee pads with a fine grip texture.
  float dk = length(p - knee);
  float face = smoothstep(-0.05, -0.3, n.y);
  float pad = (1.0 - smoothstep(0.066, 0.07, dk)) * face;
  col = mix(col, vec3(0.03, 0.031, 0.034), pad);
  h += pad * (0.5 + 0.5 * sin(p.x * 700.0) * sin(p.z * 700.0)) * 0.0003;
  float s2 = dLine(dk - 0.07, 0.0022) * face;
  col *= 1.0 - 0.5 * s2;
  h -= s2 * 0.0006;
  // Gloves from just above the wrist, with a cuff seam over the sleeve.
  vec3 dir = normalize(wrist - elbow);
  float along = dot(p - wrist, dir);
  float radial = length((p - wrist) - dir * along);
  float near = (1.0 - step(0.1, radial)) * (1.0 - step(0.2, along));
  float glove = smoothstep(-0.037, -0.033, along) * near;
  col = mix(col, vec3(0.0085, 0.009, 0.0105), glove);
  h += glove * smoothstep(0.0, 0.02, along) * dNoise(p * 900.0) * 0.00022;
  float s3 = dLine(along + 0.037, 0.002) * near * (1.0 - step(0.06, radial));
  col *= 1.0 - 0.6 * s3;
  h -= s3 * 0.0009;
  // Hood: face opening with a sealing edge, and a centre seam over the crown.
  vec3 d = p - uHeadC;
  if (dot(d, d) < 0.03) {
    float hs = dot(d, uHeadS), hu = dot(d, uHeadU), hf = dot(d, uHeadF);
    float oval = (hs / 0.05) * (hs / 0.05) + ((hu + 0.01) / 0.075) * ((hu + 0.01) / 0.075);
    float front = smoothstep(0.035, 0.05, hf);
    col = mix(col, vec3(0.5, 0.29, 0.19), (1.0 - smoothstep(0.97, 1.03, oval)) * front);
    float edge = dLine(oval - 1.1, 0.05) * front;
    col = mix(col, vec3(0.012, 0.013, 0.015), edge);
    h += edge * 0.0012;
    float top = dLine(hs, 0.0015) * step(hf, 0.03) * step(-0.02, hu);
    col *= 1.0 - 0.5 * top;
    h -= top * 0.0005;
  }
  return col;
}
`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat suitH = 0.0;\ndiffuseColor.rgb = suitShade(suitH);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = dBump(-vViewPosition, normal, vec2(dFdx(suitH), dFdy(suitH)) * uBump, faceDirection);');
  });
  return material;
}

// BCD bladder: nylon grain, quilted welds across the back and piping along the edges.
export function addBcdDetail(material) {
  chain(material, 'bcd-v1', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBcdPos;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvBcdPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${COMMON}
varying vec3 vBcdPos;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float bcdH = dGrain(vBcdPos * vec3(1.0, 1.0, 1.6), 520.0) * 0.0003;
{
  // vBcdPos is in diver coordinates; the bladder spans x = 0.07 .. 0.53.
  float back = smoothstep(0.06, 0.12, vBcdPos.y);
  float weld = max(dLine(vBcdPos.x - 0.22, 0.003), dLine(vBcdPos.x - 0.38, 0.003)) * back;
  float pipe = max(dLine(vBcdPos.x - 0.084, 0.004), dLine(vBcdPos.x - 0.516, 0.004));
  // Blue side panel with grey piping along its edges.
  float sideBand = smoothstep(0.188, 0.192, abs(vBcdPos.z)) * (1.0 - smoothstep(0.03, 0.034, abs(vBcdPos.y - 0.02)));
  float sideEdge = dLine(abs(vBcdPos.y - 0.02) - 0.032, 0.0025) * smoothstep(0.188, 0.192, abs(vBcdPos.z));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.1, 0.33), sideBand);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.052, 0.058), sideEdge);
  diffuseColor.rgb *= 1.0 - 0.45 * weld;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.022, 0.026), pipe);
  bcdH += sideEdge * 0.001;
  bcdH -= weld * 0.0025;
  bcdH += pipe * 0.0015;
}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = dBump(-vViewPosition, normal, vec2(dFdx(bcdH), dFdy(bcdH)), faceDirection);');
  });
  return material;
}
