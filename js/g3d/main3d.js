// 3D preview: atmospheric sky + clouds and the 3D cockpit with a draggable
// throttle lever. This is the foundation for the full 3D game; later milestones
// add the gun turret, fighters, flak, bomb run, and full game flow.

import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createCockpit } from './cockpit3d.js';

const canvas = document.getElementById('c');
const eng = createEngine(canvas);
eng.scene.add(eng.camera);                 // so camera-parented cockpit renders
eng.camera.rotation.x = -0.06;             // look slightly up to show more sky

const cockpit = createCockpit(eng.camera);

const state = {
  throttle: 1.0, fuel: 100, altitude: 25000, health: 100,
  fire: false, leak: false, enginesOut: 0,
  mission: { cruiseAltitude: 25000, minAltitudeToProceed: 18000 },
};

// --- Throttle lever drag ------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let grabbing = false, lastY = 0, pid = null;

function pick(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, eng.camera);
  return raycaster.intersectObjects(cockpit.grabbables, true).length > 0;
}
canvas.addEventListener('pointerdown', (e) => {
  if (pick(e)) { grabbing = true; pid = e.pointerId; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!grabbing || e.pointerId !== pid) return;
  const dy = e.clientY - lastY; lastY = e.clientY;
  state.throttle = Math.max(0.7, Math.min(1.4, state.throttle - dy * 0.004)); // drag up = more power
});
canvas.addEventListener('pointerup', (e) => { if (e.pointerId === pid) { grabbing = false; pid = null; } });

const speedEl = document.getElementById('spd');

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  state.fuel = Math.max(0, state.fuel - 0.6 * state.throttle * dt);
  cockpit.setLeverAngle((state.throttle - 0.7) / 0.7);
  cockpit.drawPanel(state);
  eng.updateClouds(dt, state.throttle);
  if (speedEl) speedEl.textContent = Math.round(state.throttle * 180) + ' mph';
  eng.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__g3d = { eng, cockpit, state };
