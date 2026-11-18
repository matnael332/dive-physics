// Shared shader materials.
import * as THREE from 'three';

// Soft additive glow with a bright rim, used for air spaces in the X-ray view.
export function glowMaterial(color, opacity = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float a = (0.16 + 0.95 * rim) * uOpacity;
        gl_FragColor = vec4(uColor * (0.55 + 1.1 * rim) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// Bubble shading: transparent centre, bright rim and a small highlight.
export function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(0.75, 0.95, 1.0) }, uLight: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0);
        vN = normalize(mat3(m) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform float uLight;
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float rim = pow(1.0 - abs(dot(n, v)), 2.0);
        vec3 l = normalize(vec3(0.25, 1.0, 0.15));
        float spec = pow(max(dot(reflect(-v, n), l), 0.0), 48.0);
        vec3 col = uTint * (0.35 + 0.9 * rim) * uLight + spec * 1.4 * uLight;
        float a = clamp(0.08 + 0.8 * rim + spec, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}
