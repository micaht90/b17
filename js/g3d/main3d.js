// 3D cockpit preview using the real B-17 cockpit PHOTO as the panel: the 3D
// sky/clouds render behind, showing through the chroma-keyed windscreen, with
// a draggable throttle handle and live readouts overlaid.

import { createEngine } from './engine.js';
import { loadCockpit, draw as drawCockpit, throttleRectScreen } from './cockpitPhoto.js';

const glCanvas = document.getElementById('c');
const overlay = document.getElementById('o');
const octx = overlay.getContext('2d');

const eng = createEngine(glCanvas);
eng.camera.rotation.x = -0.12; // tip the view up so the windscreen is full of sky

const state = {
  throttle: 1.0, fuel: 100, altitude: 25000, health: 100,
  fire: false, leak: false, enginesOut: 0,
};

// Size the overlay canvas to match (CSS px coordinate space).
let W = 0, H = 0;
function resizeOverlay() {
  const dpr = Math.min(devicePixelRatio, 2);
  W = innerWidth; H = innerHeight;
  overlay.width = W * dpr; overlay.height = H * dpr;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resizeOverlay);
resizeOverlay();

// --- Throttle drag + look-around ---------------------------------------------
eng.camera.rotation.order = 'YXZ';
const baseYaw = 0, basePitch = -0.05, cone = 0.5;
let dragging = false, onThrottle = false, lastX = 0, lastY = 0, pid = null;
function inThrottle(x, y) {
  const r = throttleRectScreen(W, H);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
overlay.addEventListener('pointerdown', (e) => {
  dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY;
  onThrottle = inThrottle(e.clientX, e.clientY); overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  // Cockpit is a fixed forward view; drag only works the throttle.
  if (onThrottle) state.throttle = Math.max(0.7, Math.min(1.4, state.throttle - dy * 0.004));
});
overlay.addEventListener('pointerup', (e) => { if (e.pointerId === pid) { dragging = false; pid = null; } });

const spdEl = document.getElementById('spd');

let last = performance.now();
let started = false;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  state.fuel = Math.max(0, state.fuel - 0.5 * state.throttle * dt);
  eng.updateClouds(dt, state.throttle);
  eng.render();
  if (started) drawCockpit(octx, W, H, state);
  if (spdEl) spdEl.textContent = Math.round(state.throttle * 180) + ' mph';
  requestAnimationFrame(tick);
}

loadCockpit('./assets/cockpit.jpg').then(() => { started = true; });
requestAnimationFrame(tick);

window.__g3d = { eng, state, started: () => started };
