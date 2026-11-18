// Teaching overlays in the 3D scene: the net-force arrow, pressure arrows and the balloon.
import * as THREE from 'three';
import { pressureAt } from '../physics.js';
import { addCaustics } from './caustics.js';

function arrowParts(color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1, 16).translate(0, 0.5, 0), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 24).translate(0, 0.09, 0), mat);
  const g = new THREE.Group();
  g.add(shaft, head);
  g.renderOrder = 8;
  shaft.renderOrder = head.renderOrder = 8;
  return { g, shaft, head, mat };
}

export function buildOverlays(diverGroup) {
  // Net buoyancy arrow, beside the diver on the camera side.
  const net = arrowParts(0x5ee7ff);
  const netRoot = new THREE.Group();
  netRoot.position.set(0.2, 0.05, -0.5);
  netRoot.add(net.g);
  diverGroup.add(netRoot);
  const netTip = new THREE.Object3D();
  netRoot.add(netTip);

  // Pressure arrows pointing at the diver from every direction (Pascal).
  const arrowGeo = (() => {
    const s = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 10).translate(0, 0.35, 0);
    const h = new THREE.ConeGeometry(0.035, 0.3, 14).translate(0, 0.85, 0);
    const merged = new THREE.BufferGeometry();
    const pos = [...s.attributes.position.array, ...h.attributes.position.array];
    const nor = [...s.attributes.normal.array, ...h.attributes.normal.array];
    const off = s.attributes.position.count;
    const idx = [...s.index.array, ...h.index.array.map((i) => i + off)];
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    merged.setIndex(idx);
    return merged;
  })();
  const PN = 64;
  const pMat = new THREE.MeshBasicMaterial({ color: 0x9bf0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const pArrows = new THREE.InstancedMesh(arrowGeo, pMat, PN);
  pArrows.frustumCulled = false;
  pArrows.renderOrder = 8;
  const dirs = [];
  for (let i = 0; i < PN; i++) {
    const y = 1 - (2 * (i + 0.5)) / PN;
    const r = Math.sqrt(1 - y * y);
    const th = i * Math.PI * (3 - Math.sqrt(5));
    dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  const pCenter = new THREE.Vector3(-0.08, 0.08, 0);
  const pRadii = new THREE.Vector3(1.0, 0.46, 0.48);
  diverGroup.add(pArrows);

  // Red balloon tied to the weight belt.
  const balloon = new THREE.Group();
  const skin = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    addCaustics(new THREE.MeshPhysicalMaterial({ color: 0xd3141c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.3 }))
  );
  skin.scale.set(1, 1.18, 1);
  balloon.add(skin);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 16), skin.material);
  knot.position.y = -1.22;
  balloon.add(knot);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xdcd6c8 }));
  diverGroup.add(balloon, string);
  const tie = new THREE.Vector3(0.03, 0.02, -0.19);
  const balloonTip = new THREE.Object3D();
  balloon.add(balloonTip);
  balloonTip.position.y = 1.3;
  const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const SURFACE_RADIUS = 0.16; // about 17 litres when inflated at the surface

  const state = { netKg: 0, netShow: 0, pShow: 0, bShow: 0 };

  function update({ netKg, showNet, showPressure, showBalloon, depth, time, dt, settle }) {
    const k = settle ? 1 : 1 - Math.exp(-dt * 5);
    state.netShow += ((showNet ? 1 : 0) - state.netShow) * k;
    state.pShow += ((showPressure ? 1 : 0) - state.pShow) * k;
    state.bShow += ((showBalloon ? 1 : 0) - state.bShow) * k;
    state.netKg += (netKg - state.netKg) * k;

    // Net arrow: length grows with the net force, cyan when floating, orange when sinking.
    const len = Math.min(1.1, 0.12 + Math.abs(state.netKg) * 0.11);
    net.shaft.scale.y = Math.max(0.001, len - 0.18);
    net.head.position.y = len - 0.18;
    net.g.rotation.x = state.netKg >= 0 ? 0 : Math.PI;
    net.mat.color.set(state.netKg >= 0 ? 0x5ee7ff : 0xff9a3c);
    net.mat.opacity = 0.92 * state.netShow;
    net.g.visible = state.netShow > 0.02;
    netTip.position.y = (state.netKg >= 0 ? 1 : -1) * (len + 0.05);

    // Pressure arrows: longer and thicker as the pressure grows; a gentle push in and out.
    const P = pressureAt(depth);
    pMat.opacity = 0.75 * state.pShow;
    pArrows.visible = state.pShow > 0.02;
    if (pArrows.visible) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const L = 0.16 + 0.07 * P, T = 0.6 + 0.25 * P;
      for (let i = 0; i < PN; i++) {
        const n = dirs[i];
        const pulse = 0.03 * Math.sin(time * 3 + i * 0.7);
        p.set(pCenter.x + n.x * pRadii.x, pCenter.y + n.y * pRadii.y, pCenter.z + n.z * pRadii.z);
        const inward = v.copy(n).multiplyScalar(-1);
        p.addScaledVector(n, L + 0.05 + pulse);
        q.setFromUnitVectors(up, inward);
        s.set(T, L, T);
        m.compose(p, q, s);
        pArrows.setMatrixAt(i, m);
      }
      pArrows.instanceMatrix.needsUpdate = true;
    }

    // Balloon: radius follows Boyle's law (volume ∝ 1/P, radius ∝ cube root).
    const r = SURFACE_RADIUS * Math.cbrt(1 / P);
    const showR = r * Math.min(1, state.bShow * 1.2);
    balloon.visible = string.visible = state.bShow > 0.02;
    if (balloon.visible) {
      const sway = Math.sin(time * 0.8) * 0.04;
      balloon.position.set(tie.x - 0.06 + sway, tie.y + 0.62 + r * 1.2, tie.z - 0.16);
      balloon.scale.setScalar(showR);
      balloon.rotation.z = sway * 0.8;
      const bottom = v.set(0, -1.32, 0).multiplyScalar(showR).add(balloon.position);
      const dir = bottom.clone().sub(tie);
      string.position.copy(tie);
      string.scale.set(1, dir.length(), 1);
      string.quaternion.setFromUnitVectors(up, dir.normalize());
    }
  }

  return { update, anchors: { netTip, balloon: balloonTip }, balloonVolume: (depth) => 17 / pressureAt(depth) };
}
