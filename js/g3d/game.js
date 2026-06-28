// Unified 3D B-17: one scene with a station switcher between the photo cockpit
// (pilot, throttle) and the 3D gun stations (swing to aim, tap to fire). Shared
// sky/terrain/formation, fighters that attack and that you shoot down.

import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createTerrain } from './terrain.js';
import { makeFighter, makeBomber } from './aircraft.js';
import { drawGunFrame } from './frame2d.js';
import { loadCockpit, draw as drawCockpit, throttleRectScreen } from './cockpitPhoto.js';
import { pushRadio, updateRadio } from '../radio.js';

const glCanvas = document.getElementById('c');
const overlay = document.getElementById('o');
const octx = overlay.getContext('2d');

const eng = createEngine(glCanvas, { deck: false });
const camera = eng.camera;
camera.rotation.order = 'YXZ';
eng.scene.add(camera);
createTerrain(eng.scene);

// Station base orientations + aim cones.
const STATIONS = {
  pilot: { yaw: 0, pitch: -0.12, pilot: true },
  nose: { yaw: 0, pitch: -0.05, cone: 0.7, label: '12 o\'clock' },
  top: { yaw: 0, pitch: 0.4, cone: 0.8, label: 'high' },
  ball: { yaw: 0, pitch: -0.75, cone: 0.7, label: 'low' },
  tail: { yaw: Math.PI, pitch: -0.05, cone: 0.7, label: '6 o\'clock' },
  waistL: { yaw: -Math.PI / 2, pitch: -0.05, cone: 0.7, label: '9 o\'clock' },
  waistR: { yaw: Math.PI / 2, pitch: -0.05, cone: 0.7, label: '3 o\'clock' },
};

const state = {
  mode: 'pilot', throttle: 1.0, fuel: 100, health: 100, score: 0,
  altitude: 25000, speed: 232, heading: 0, time: '07:54', radio: [],
  base: { yaw: 0, pitch: -0.12, cone: 0.7 },
};

// --- Gun + ring sight (parented to the camera) --------------------------------
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.5, roughness: 0.6 });
function barrel(x) {
  const g = new THREE.Group();
  const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 14), gunMat);
  j.rotation.x = -Math.PI / 2; j.position.set(x, -0.45, -1.05);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), gunMat); r.position.set(x, -0.45, -0.3);
  g.add(j, r); return g;
}
const gun = new THREE.Group();
gun.add(barrel(-0.16), barrel(0.16));
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a4d });
const sight = new THREE.Group();
const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.011, 8, 28), ringMat); ringM.position.set(0, -0.16, -1.7);
const beadM = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), ringMat); beadM.position.set(0, -0.16, -1.7);
const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), ringMat); postM.position.set(0, -0.24, -1.7);
sight.add(ringM, beadM, postM);
gun.add(sight);
camera.add(gun);

// --- Formation B-17s + fighters ----------------------------------------------
for (const p of [[-130, -35, -230], [165, 5, -380], [-320, 30, -640]]) {
  const b = makeBomber(); b.position.set(...p); b.rotation.y = Math.PI; b.scale.setScalar(1.5); eng.scene.add(b);
}
const fighters = [];
function resetFighter(f) {
  const a = Math.random() * Math.PI * 2, d = 420 + Math.random() * 360;
  f.position.set(Math.cos(a) * d, (Math.random() - 0.25) * 240, Math.sin(a) * d);
  f.userData.vel = new THREE.Vector3(-Math.sin(a), (Math.random() - 0.5) * 0.2, Math.cos(a)).multiplyScalar(45 + Math.random() * 40);
  f.userData.alive = true; f.visible = true; f.scale.setScalar(2.0); f.userData.atk = 3 + Math.random() * 3;
}
for (let i = 0; i < 5; i++) { const f = makeFighter(); resetFighter(f); eng.scene.add(f); fighters.push(f); }

const bursts = [];
function burst(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true }));
  m.position.copy(p); m.userData.life = 0.5; eng.scene.add(m); bursts.push(m);
}

// --- Station switching --------------------------------------------------------
function switchTo(id) {
  const s = STATIONS[id]; if (!s) return;
  state.mode = id;
  state.base = { yaw: s.yaw, pitch: s.pitch, cone: s.cone || 0.7 };
  camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
  gun.visible = !s.pilot;
  for (const b of document.querySelectorAll('#bar button')) b.classList.toggle('active', b.dataset.st === id);
}
for (const b of document.querySelectorAll('#bar button')) b.addEventListener('click', () => switchTo(b.dataset.st));

// --- Input --------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
let dragging = false, lastX = 0, lastY = 0, moved = 0, pid = null, onThrottle = false;
const SENS = 0.0035;
overlay.addEventListener('pointerdown', (e) => {
  dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0;
  onThrottle = state.mode === 'pilot' && inThrottle(e.clientX, e.clientY);
  overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  if (state.mode === 'pilot') {
    if (onThrottle) state.throttle = Math.max(0.7, Math.min(1.4, state.throttle - dy * 0.004));
  } else {
    camera.rotation.y = clamp(camera.rotation.y - dx * SENS, state.base.yaw - state.base.cone, state.base.yaw + state.base.cone);
    camera.rotation.x = clamp(camera.rotation.x - dy * SENS, Math.max(-0.95, state.base.pitch - state.base.cone), Math.min(0.5, state.base.pitch + state.base.cone));
  }
});
overlay.addEventListener('pointerup', (e) => {
  if (e.pointerId === pid && moved < 8 && state.mode !== 'pilot') fire();
  dragging = false; pid = null;
});
function inThrottle(x, y) { const r = throttleRectScreen(W, H); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function fire() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(fighters, true);
  let hit = null;
  for (const h of hits) { let o = h.object; while (o && fighters.indexOf(o) === -1) o = o.parent; if (o && o.userData.alive) { hit = o; break; } }
  if (hit) { hit.userData.alive = false; hit.visible = false; burst(hit.position); state.score++; pushRadio(state, 'Splash one!', 'info'); setTimeout(() => resetFighter(hit), 1500); }
  ringMat.color.set(0xffe08a); setTimeout(() => ringMat.color.set(0xff5a4d), 60);
}

// --- Overlay sizing -----------------------------------------------------------
let W = 0, H = 0;
function resizeOverlay() {
  const dpr = Math.min(devicePixelRatio, 2); W = innerWidth; H = innerHeight;
  overlay.width = W * dpr; overlay.height = H * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resizeOverlay); resizeOverlay();

// --- Loop ---------------------------------------------------------------------
let cockpitReady = false;
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  state.speed = Math.round(state.throttle * 180);
  state.heading = Math.round(((-camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
  state.fuel = Math.max(0, state.fuel - 0.4 * state.throttle * dt);
  eng.updateClouds(dt, state.throttle);
  updateRadio(state, dt);

  for (const f of fighters) {
    if (!f.userData.alive) continue;
    f.position.addScaledVector(f.userData.vel, dt);
    f.lookAt(f.position.clone().add(f.userData.vel));
    if (f.position.length() > 1400) resetFighter(f);
    f.userData.atk -= dt;
    if (f.userData.atk <= 0 && f.position.length() < 650) {
      f.userData.atk = 4 + Math.random() * 4;
      state.health = Math.max(0, state.health - 5);
      pushRadio(state, 'We\'re taking hits!', 'alert');
    }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.userData.life -= dt; b.scale.multiplyScalar(1 + dt * 4); b.material.opacity = Math.max(0, b.userData.life / 0.5);
    if (b.userData.life <= 0) { eng.scene.remove(b); bursts.splice(i, 1); }
  }

  eng.render();
  if (state.mode === 'pilot') { if (cockpitReady) drawCockpit(octx, W, H, state); else octx.clearRect(0, 0, W, H); }
  else drawGunFrame(octx, W, H, state);
  drawStatus(octx, W, H, state);
  drawRadio(octx, W, H, state);
  requestAnimationFrame(tick);
}

function drawStatus(ctx, W, H, s) {
  const fs = Math.max(12, H * 0.026);
  const bw = fs * 8, x = W - bw - 8, y = 30;
  ctx.font = `bold ${fs}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(6,10,14,0.6)';
  rr(ctx, x, y, bw, fs * 3.0, 6); ctx.fill();
  bar(ctx, x + 6, y + 6, bw - 12, fs * 0.9, s.health / 100, s.health > 40 ? '#5fc77a' : '#e0584a', `HULL ${Math.round(s.health)}%`, fs);
  bar(ctx, x + 6, y + 6 + fs * 1.3, bw - 12, fs * 0.9, s.fuel / 100, s.fuel > 30 ? '#5fc77a' : '#e6b84d', `FUEL ${Math.round(s.fuel)}%`, fs);
}
function bar(ctx, x, y, w, h, f, col, label, fs) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = col; rr(ctx, x, y, w * Math.max(0, Math.min(1, f)), h, 3); ctx.fill();
  ctx.fillStyle = '#eaf2f8'; ctx.font = `bold ${h * 0.85}px "Courier New", monospace`; ctx.textAlign = 'left';
  ctx.fillText(label, x + 4, y + h * 0.82);
}
function drawRadio(ctx, W, H, s) {
  if (!s.radio.length) return;
  const fs = Math.max(12, H * 0.026), lh = fs * 1.35, baseY = H - 30;
  ctx.font = `bold ${fs}px "Courier New", monospace`; ctx.textAlign = 'center';
  const n = s.radio.length;
  for (let i = 0; i < n; i++) {
    const m = s.radio[i], y = baseY - (n - 1 - i) * lh, al = Math.min(1, m.t / 1.5);
    const c = m.level === 'alert' ? '224,88,74' : m.level === 'warn' ? '230,184,77' : '215,227,236';
    const tw = ctx.measureText(m.text).width + 20;
    ctx.fillStyle = `rgba(0,0,0,${0.4 * al})`; rr(ctx, W / 2 - tw / 2, y - fs, tw, fs * 1.3, 4); ctx.fill();
    ctx.fillStyle = `rgba(${c},${al})`; ctx.fillText(m.text, W / 2, y);
  }
  ctx.textAlign = 'left';
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

switchTo('pilot');
loadCockpit('./assets/cockpit.jpg').then(() => { cockpitReady = true; });
requestAnimationFrame(tick);

window.__game = { eng, camera, state, fighters, switchTo, fire };
