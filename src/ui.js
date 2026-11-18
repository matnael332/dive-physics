// Everything on the page outside the 3D canvas: gauges, panels, labels and the scroll position.
import * as THREE from 'three';
import { pressureAt } from './physics.js';
import { createEarFigure } from './figures/ear.js';
import { createBoyleFigure } from './figures/boyle.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const fmt = (x, d = 1) => (Math.abs(x) < 0.05 && d === 1 ? 0 : x).toFixed(d);

// Where each label sits relative to its point, so neighbouring labels do not overlap.
const LABEL_OFFSET = {
  sinus: 'translate(-50%, -160%)',
  ear: 'translate(-50%, 110%)',
  mask: 'translate(-112%, -110%)',
  lungs: 'translate(-50%, 70%)',
};
const LABEL_TEXT = {
  lungs: 'ריאות',
  sinus: 'סינוסים',
  ear: 'אוזן תיכונה',
  mask: 'אוויר במסכה',
  bcd: 'מאזן ציפה',
  balloon: 'בלון',
  net: 'ציפה נטו',
};

export function buildUI(chapters, profile) {
  const sections = [...document.querySelectorAll('.chapter')];
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const els = {
    depth: $('depthValue'), pressure: $('pressureValue'), split: $('pressureSplit'),
    fill: $('gaugeFill'), marker: $('gaugeMarker'),
    forces: $('forcesPanel'), speed: $('speedValue'), net: $('netValue'), netState: $('netState'),
    suitBar: $('suitBar'), suitValue: $('suitValue'), bcdBar: $('bcdBar'), bcdValue: $('bcdValue'),
    lungBar: $('lungBar'), lungValue: $('lungValue'), speedLine: $('speedLine'), speedDot: $('speedDot'),
    balloonPanel: $('balloonPanel'), balloonLitres: $('balloonLitres'), balloonFraction: $('balloonFraction'), balloonFormula: $('balloonFormula'),
    ear: $('earPanel'), earState: $('earState'), earDelta: $('earDelta'), earMetres: $('earMetres'),
    warn: $('warnPanel'), lungFactor: $('lungFactor'), lungDanger: $('lungDanger'), runaway: $('runaway'),
    labels: $('labels'),
  };
  const earFig = createEarFigure($('earFig'));
  const boyleFig = createBoyleFigure($('boyleFig'));
  const GAUGE_MAX = 40;
  document.querySelectorAll('.gauge-tick').forEach((t) => {
    t.style.top = (Number(t.dataset.d) / GAUGE_MAX) * 100 + '%';
  });

  // Descent speed against depth, 0-10 m, drawn once from the simulated profile.
  const chart = { x0: 30, x1: 232, y0: 60, y1: 6, maxD: 10, maxV: 20 };
  const cx = (d) => chart.x0 + (Math.min(d, chart.maxD) / chart.maxD) * (chart.x1 - chart.x0);
  const cy = (v) => chart.y0 - (Math.min(v, chart.maxV) / chart.maxV) * (chart.y0 - chart.y1);
  {
    const pts = [];
    let lastD = -1;
    for (const s of profile.samples) {
      if (s.t < profile.marks.vent) continue;
      if (s.depth > chart.maxD || s.phase === 'descent') break;
      if (s.depth - lastD < 0.08) continue;
      lastD = s.depth;
      pts.push(cx(s.depth).toFixed(1) + ',' + cy(Math.max(0, -s.v * 60)).toFixed(1));
    }
    els.speedLine.setAttribute('points', pts.join(' '));
  }

  // Labels that follow points in the 3D scene.
  const labelEls = {};
  for (const [id, text] of Object.entries(LABEL_TEXT)) {
    const d = document.createElement('div');
    d.className = 'tag' + (id === 'net' ? ' warm' : '');
    d.textContent = text;
    d.style.opacity = '0';
    els.labels.appendChild(d);
    labelEls[id] = d;
  }
  // The net-force label holds a signed number, kept left-to-right inside the Hebrew text.
  const netNum = document.createElement('span');
  netNum.dir = 'ltr';
  labelEls.net.textContent = 'ציפה נטו ';
  labelEls.net.append(netNum, document.createTextNode(' ק"ג'));
  const v = new THREE.Vector3();
  function placeLabel(id, obj, camera, visible) {
    const el = labelEls[id];
    if (!el) return;
    if (!visible || !obj) {
      el.style.opacity = '0';
      return;
    }
    obj.getWorldPosition(v);
    v.project(camera);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) {
      el.style.opacity = '0';
      return;
    }
    const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${LABEL_OFFSET[id] || 'translate(-50%, -130%)'}`;
    el.style.opacity = '1';
  }

  // Which chapter is in view, and how far through it (0..1).
  function scrollState() {
    const mid = window.scrollY + window.innerHeight * 0.5;
    let idx = 0;
    for (let i = 0; i < sections.length; i++) if (sections[i].offsetTop <= mid) idx = i;
    const s = sections[idx];
    const p = Math.min(1, Math.max(0, (mid - s.offsetTop) / s.offsetHeight));
    const ch = byId.get(s.dataset.ch);
    return { chapter: ch, index: idx, progress: p, time: ch.t[0] + (ch.t[1] - ch.t[0]) * p };
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function setHidden(el, hidden) {
    if (el.hidden !== hidden) el.hidden = hidden;
  }

  function update({ sample, chapter, dt, camera, anchors, show }) {
    const d = sample.depth;
    const P = pressureAt(d);
    els.depth.textContent = fmt(d);
    els.pressure.textContent = P.toFixed(2);
    els.split.textContent = `1 בר אוויר + ${(P - 1).toFixed(2)} בר מים`;
    const g = Math.min(1, d / GAUGE_MAX) * 100;
    els.fill.style.height = g + '%';
    els.marker.style.top = g + '%';

    // Forces panel.
    setHidden(els.forces, !show.forces);
    if (show.forces) {
      const speed = sample.v * 60;
      els.speed.textContent = (speed > 0.3 ? '↑ ' : speed < -0.3 ? '↓ ' : '') + Math.abs(speed).toFixed(1);
      els.net.textContent = (sample.net > 0 ? '+' : '') + sample.net.toFixed(1);
      const st = sample.net > 0.25 ? ['צף: הציפה גדולה מהמשקל', 'state up'] : sample.net < -0.25 ? ['שוקע: המשקל גדול מהציפה', 'state down'] : ['כמעט מאוזן', 'state'];
      els.netState.textContent = st[0];
      els.netState.className = st[1];
      els.suitBar.style.width = (sample.suitLitres / 6) * 100 + '%';
      els.suitValue.textContent = sample.suitLitres.toFixed(1) + " ל'";
      els.bcdBar.style.width = Math.min(100, (sample.bcdLitres / 6) * 100) + '%';
      els.bcdValue.textContent = sample.bcdLitres.toFixed(1) + " ל'";
      const lung = sample.lungDelta;
      els.lungBar.style.width = Math.max(0, Math.min(100, ((lung + 1.5) / 3) * 100)) + '%';
      els.lungValue.textContent = lung < -0.4 ? 'אחרי נשיפה' : 'נשימה רגילה';
      const dd = Math.min(d, 10);
      els.speedDot.setAttribute('cx', cx(dd).toFixed(1));
      els.speedDot.setAttribute('cy', cy(Math.max(0, -sample.v * 60)).toFixed(1));
    }

    // Balloon panel.
    setHidden(els.balloonPanel, !show.balloonPanel);
    if (show.balloonPanel) {
      const vol = 17 / P;
      els.balloonLitres.textContent = vol.toFixed(1);
      els.balloonFraction.textContent = '1/' + P.toFixed(1);
      els.balloonFormula.textContent = `1 × 17 = ${P.toFixed(1)} × ${vol.toFixed(1)}`;
      boyleFig.update(dt, d, reduceMotion);
    }

    // Ear model: a short descent without equalizing pushes the eardrum in; equalizing lets air up the tube.
    setHidden(els.ear, !show.ear);
    if (show.ear) {
      const e = earFig.update(dt, reduceMotion);
      setText(els.earState, e.equalizing
        ? 'משווים לחצים: אוויר עולה מהגרון דרך החצוצרה, ועור התוף חוזר למקומו.'
        : e.dp >= 0.15 ? 'עור התוף מתוח ומכאיב. משווים לחצים עכשיו.'
          : e.dp > 0.02 ? 'הלחץ בתעלה גבוה מהלחץ באוזן התיכונה: עור התוף נדחף פנימה.'
            : 'הלחץ משני צדי עור התוף שווה.');
      setText(els.earDelta, e.dp.toFixed(2));
      setText(els.earMetres, e.metres.toFixed(1));
    }

    // Breath-hold warning during the ascent.
    setHidden(els.warn, !show.warn);
    if (show.warn) {
      const f = pressureAt(30) / P;
      els.lungFactor.textContent = f.toFixed(1);
      els.lungDanger.hidden = f < 1.15;
      els.runaway.textContent = '+' + sample.runaway.toFixed(1);
    }

    // Labels.
    const want = new Set(show.labels || []);
    for (const id of Object.keys(LABEL_TEXT)) {
      if (id === 'net') continue;
      placeLabel(id, anchors[id], camera, want.has(id));
    }
    netNum.textContent = (sample.net > 0 ? '+' : '') + sample.net.toFixed(1);
    placeLabel('net', anchors.net, camera, !!show.arrow);
    return chapter;
  }

  return { update, scrollState };
}
