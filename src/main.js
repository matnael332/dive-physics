import * as THREE from 'three';
import { buildWorld } from './scene/world.js';
import { buildDiver } from './scene/diver.js';
import { buildOverlays } from './scene/overlays.js';
import { CAUSTICS } from './scene/caustics.js';
import { simulateDive, sampleAt, netBuoyancy, pressureAt } from './physics.js';
import { buildChapters } from './story.js';
import { buildUI } from './ui.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?settle skips easing (used for screenshots and automated checks).
// ?shot=az,el,dist,time hides the page and holds one camera view (used for the README images).
const query = new URLSearchParams(location.search);
const shot = query.get('shot') ? query.get('shot').split(',').map(Number) : null;
const settle = query.has('settle') || !!shot;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot() {
  const profile = simulateDive();
  const chapters = buildChapters(profile.marks);
  const ui = buildUI(chapters, profile);
  if (!webglAvailable()) {
    document.body.classList.add('no-webgl');
    return;
  }
  await nextFrame();

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);

  const world = buildWorld(renderer);
  const diver = buildDiver();
  world.scene.add(diver.group);
  const overlays = buildOverlays(diver.group);
  const anchors = { ...diver.anchors, balloon: overlays.anchors.balloon, net: overlays.anchors.netTip };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 55 : 40;
    // Keep the diver clear of the story cards: they sit on the right on wide screens, at the bottom on phones.
    if (shot) camera.clearViewOffset();
    else if (w > 760) camera.setViewOffset(w, h, w * 0.08, 0, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.14, w, h);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const first = ui.scrollState();
  let tShown = first.time;
  const cam = { ...first.chapter.cam, target: new THREE.Vector3(...first.chapter.cam.target) };
  const fx = { xray: 0, ghost: 0 };
  const goalTarget = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const exhaustPos = new THREE.Vector3();
  let last = performance.now(), time = 0, bubbleDebt = 0;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    CAUSTICS.uTime.value = time;

    const st = ui.scrollState();
    if (shot) {
      st.time = shot[3];
      st.chapter = {
        ...(chapters.find((c) => shot[3] >= c.t[0] && shot[3] <= c.t[1]) || chapters[0]),
        cam: { az: shot[0], el: shot[1], dist: shot[2], target: [0.1, 0.05, 0] },
        show: { kick: true, balloon: shot[4] === 1 },
      };
    }
    const ch = st.chapter, show = ch.show;
    tShown += (st.time - tShown) * (settle ? 1 : 1 - Math.exp(-dt * 3.2));
    const s = sampleAt(profile, tShown);
    const P = pressureAt(s.depth);
    s.runaway = netBuoyancy({ depth: s.depth, bcdLitres: profile.marks.bcdAt30 / P });

    // Diver placement and small natural movements.
    diver.group.position.set(0, -s.depth - 0.18, 0);
    diver.group.rotation.z = 0.025 * Math.sin(time * 0.45);
    diver.group.rotation.x = 0.018 * Math.sin(time * 0.33);

    // Breathing: inhale, then exhale bubbles through the regulator.
    const cycle = (time % 5) / 5;
    const breath = Math.sin(cycle * Math.PI * 2);
    if (cycle > 0.5 && cycle < 0.92 && s.depth > 0.5) {
      bubbleDebt += dt * 70;
      const n = Math.floor(bubbleDebt);
      if (n > 0) {
        bubbleDebt -= n;
        world.emitBubbles(diver.exhaust.getWorldPosition(exhaustPos), n);
      }
    }

    const k = settle ? 1 : 1 - Math.exp(-dt * 3);
    fx.xray += ((show.xray || 0) - fx.xray) * k;
    const factor = pressureAt(30) / P;
    fx.ghost += ((show.ghost && factor > 1.05 ? 0.9 : 0) - fx.ghost) * k;
    diver.update({
      depth: s.depth,
      inflation: Math.min(1, s.bcdLitres / 6),
      xray: fx.xray,
      ghost: fx.ghost,
      ghostScale: Math.min(1.5, Math.cbrt(factor)),
      breath,
      kickAmp: show.kick ? 0.55 : s.phase === 'surface' || s.phase === 'surfaced' ? 0.2 : 0.07,
      kickPhase: time * 1.7,
      tankBar: 200 - tShown * 0.18,
      diveTime: Math.max(0, tShown - profile.marks.vent),
    });
    overlays.update({
      settle,
      netKg: s.net, showNet: !!show.arrow, showPressure: !!show.pressure, showBalloon: !!show.balloon,
      depth: s.depth, time, dt,
    });

    // Camera: ease toward the chapter's view, with a slow drift and a little pointer parallax.
    const goal = ch.cam;
    const kc = settle ? 1 : 1 - Math.exp(-dt * 1.6);
    let daz = goal.az - cam.az;
    daz = ((daz + 540) % 360) - 180;
    cam.az += daz * kc;
    cam.el += (goal.el - cam.el) * kc;
    cam.dist += (goal.dist - cam.dist) * kc;
    goalTarget.set(...goal.target);
    cam.target.lerp(goalTarget, kc);
    const drift = reduceMotion ? 0 : 1;
    const az = THREE.MathUtils.degToRad(cam.az + drift * (2.5 * Math.sin(time * 0.11) + pointer.x * 5));
    const el = THREE.MathUtils.degToRad(cam.el + drift * (1.2 * Math.sin(time * 0.15) - pointer.y * 3));
    focus.copy(cam.target).add(diver.group.position);
    camera.position.set(
      focus.x + cam.dist * Math.cos(el) * Math.sin(az),
      focus.y + cam.dist * Math.sin(el),
      focus.z + cam.dist * Math.cos(el) * Math.cos(az)
    );
    if (camera.position.y > -0.25) camera.position.y = -0.25;
    camera.lookAt(focus);

    world.update(s.depth, camera, dt, renderer.domElement.height, focus);
    ui.update({ sample: s, chapter: ch, dt, camera, anchors, show });
    renderer.render(world.scene, camera);
    requestAnimationFrame(frame);
  }
  if (shot) document.body.classList.add('shot');
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  document.body.classList.add('no-webgl');
});
