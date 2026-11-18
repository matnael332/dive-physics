// Animated caustics (the dancing light pattern under waves), injected into standard materials.
import * as THREE from 'three';

export const CAUSTICS = {
  uTime: { value: 0 },
  uCausticStrength: { value: 1 },
  uCausticColor: { value: new THREE.Color(1, 1, 1) },
};

const PARS = /* glsl */ `
uniform float uTime;
uniform float uCausticStrength;
uniform vec3 uCausticColor;
varying vec3 vCausticW;
vec2 cHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float cCell(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * cHash(i + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
float caustics(vec3 w, float t) {
  vec2 p = w.xz * 0.9 + vec2(w.y * 0.15, -w.y * 0.1);
  p += 0.35 * vec2(sin(p.y * 1.7 + t * 0.4), sin(p.x * 1.3 - t * 0.35));
  float a = 1.0 - smoothstep(0.0, 0.2, cCell(p, t * 0.9));
  float b = 1.0 - smoothstep(0.0, 0.17, cCell(p * 1.63 + 7.3, t * 1.2 + 2.0));
  return a * a * 0.6 + b * b * 0.45 + a * b * 0.6;
}
`;

export function addCaustics(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CAUSTICS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausticW;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCausticW = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float up = clamp(nW.y * 0.8 + 0.25, 0.0, 1.0);
          float c = caustics(vCausticW, uTime) * uCausticStrength * up;
          reflectedLight.directDiffuse += diffuseColor.rgb * uCausticColor * c;
        }`
      );
  };
  material.customProgramCacheKey = () => 'caustics-v1';
  return material;
}
