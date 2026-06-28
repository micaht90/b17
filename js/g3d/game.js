// Unified 3D B-17 — full mission: briefing -> take off -> cruise (man the
// cockpit + gun stations, fight off waves, survive flak) -> 3D bomb run ->
// results. One Three.js scene; reuses the game's radio + mission data.

import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createTerrain } from './terrain.js';
import { makeFighter, makeBomber } from './aircraft.js';
import { drawGunFrame } from './frame2d.js';
import { loadCockpit, draw as drawCockpit, throttleRectScreen } from './cockpitPhoto.js';
import { pushRadio, updateRadio, radioBandit, radioKill } from '../radio.js';
import { getMission } from '../data/missions.js';

const glCanvas = document.getElementById('c');
const overlay = document.getElementById('o');
const octx = overlay.getContext('2d');
const barEl = document.getElementById('bar');
const dropBtn = document.getElementById('drop');
const screenEl = document.getElementById('screen');

const eng = createEngine(glCanvas, { deck: false });
const camera = eng.camera;
camera.rotation.order = 'YXZ';
eng.scene.add(camera);
createTerrain(eng.scene);

const mission = getMission(0);
const CRUISE_RATE = 3.4;            // route units/sec at full throttle

const STATIONS = {
  pilot: { yaw: 0, pitch: -0.05, pilot: true, cone: 0.5 },
  nose: { yaw: 0, pitch: -0.05, cone: 0.7 },
  top: { yaw: 0, pitch: 0.4, cone: 0.8 },
  ball: { yaw: 0, pitch: -0.75, cone: 0.7 },
  tail: { yaw: Math.PI, pitch: -0.05, cone: 0.7 },
  waistL: { yaw: -Math.PI / 2, pitch: -0.05, cone: 0.7 },
  waistR: { yaw: Math.PI / 2, pitch: -0.05, cone: 0.7 },
};
const ARC_DIR = {
  FRONT: [0, 0, -1], REAR: [0, 0, 1], LEFT: [-1, 0, 0], RIGHT: [1, 0, 0],
  HIGH: [0, 1, -0.3], LOW: [0, -1, 0.3],
};

const state = {
  phase: 'briefing', mode: 'pilot', throttle: 1.0, fuel: 100, health: 100,
  score: 0, kills: 0, position: 0, altitude: 25000, speed: 232, heading: 0,
  time: '07:54', radio: [], hitFlash: 0, base: { yaw: 0, pitch: -0.05, cone: 0.5 },
  bomb: null, result: null, won: false,
  _waves: new Set(), _flakT: 0, _warned: {},
};

// --- Gun + ring sight ---------------------------------------------------------
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
const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.011, 8, 28), ringMat); ringM.position.set(0, -0.16, -1.7);
const beadM = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), ringMat); beadM.position.set(0, -0.16, -1.7);
const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), ringMat); postM.position.set(0, -0.24, -1.7);
gun.add(ringM, beadM, postM);
camera.add(gun);

// --- Formation + fighter pool -------------------------------------------------
for (const p of [[-130, -35, -230], [165, 5, -380], [-320, 30, -640]]) {
  const b = makeBomber(); b.position.set(...p); b.rotation.y = Math.PI; b.scale.setScalar(1.5); eng.scene.add(b);
}
const fighters = [];
for (let i = 0; i < 7; i++) { const f = makeFighter(); f.visible = false; f.userData.alive = false; f.scale.setScalar(2); eng.scene.add(f); fighters.push(f); }
function liveCount() { return fighters.filter((f) => f.userData.alive).length; }
function spawnFromArc(arc) {
  const f = fighters.find((x) => !x.userData.alive); if (!f) return;
  const d = new THREE.Vector3(...(ARC_DIR[arc] || [0, 0, -1])).normalize();
  f.position.copy(d).multiplyScalar(560 + Math.random() * 260);
  const tan = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar((Math.random() - 0.5) * 60);
  f.userData.vel = d.clone().multiplyScalar(-(48 + Math.random() * 30)).add(tan);
  f.userData.alive = true; f.visible = true; f.userData.atk = 3 + Math.random() * 3;
  radioBandit(state, arc);
}

const bursts = [];
function burst(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true }));
  m.position.copy(p); m.userData.life = 0.5; eng.scene.add(m); bursts.push(m);
}

// --- Bomb-run target ----------------------------------------------------------
let target = null;
function makeTarget() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 1 });
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 36), m); b.position.set(-100 + i * 66, 13, 0); g.add(b); }
  for (const x of [-60, 40]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 60, 10), m); c.position.set(x, 30, -30); g.add(c); }
  return g;
}

// --- Station switching --------------------------------------------------------
function switchTo(id) {
  const s = STATIONS[id]; if (!s || state.phase !== 'cruise') return;
  state.mode = id;
  state.base = { yaw: s.yaw, pitch: s.pitch, cone: s.cone || 0.7 };
  camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
  gun.visible = !s.pilot;
  for (const b of barEl.querySelectorAll('button')) b.classList.toggle('active', b.dataset.st === id);
}
for (const b of barEl.querySelectorAll('button')) b.addEventListener('click', () => switchTo(b.dataset.st));

// --- Input --------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
let dragging = false, lastX = 0, lastY = 0, moved = 0, pid = null, onThrottle = false;
const SENS = 0.0035;
function inThrottle(x, y) { const r = throttleRectScreen(W, H); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
overlay.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'cruise') return;
  dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0;
  onThrottle = state.mode === 'pilot' && inThrottle(e.clientX, e.clientY);
  overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  if (state.mode === 'pilot') { if (onThrottle) state.throttle = clamp(state.throttle - dy * 0.004, 0.7, 1.4); }
  else {
    camera.rotation.y = clamp(camera.rotation.y - dx * SENS, state.base.yaw - state.base.cone, state.base.yaw + state.base.cone);
    camera.rotation.x = clamp(camera.rotation.x - dy * SENS, Math.max(-0.95, state.base.pitch - state.base.cone), Math.min(0.55, state.base.pitch + state.base.cone));
  }
});
overlay.addEventListener('pointerup', (e) => {
  if (e.pointerId === pid && moved < 8 && state.phase === 'cruise' && state.mode !== 'pilot') fire();
  dragging = false; pid = null;
});
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function fire() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(fighters, true);
  let hit = null;
  for (const h of hits) { let o = h.object; while (o && fighters.indexOf(o) === -1) o = o.parent; if (o && o.userData.alive) { hit = o; break; } }
  if (hit) { hit.userData.alive = false; hit.visible = false; burst(hit.position); state.kills++; radioKill(state); }
  ringMat.color.set(0xffe08a); setTimeout(() => ringMat.color.set(0xff5a4d), 60);
}

// --- Phases -------------------------------------------------------------------
function showBriefing() {
  state.phase = 'briefing';
  barEl.style.display = 'none'; dropBtn.style.display = 'none';
  screenEl.style.display = 'flex';
  screenEl.innerHTML = `<h1>MISSION BRIEFING</h1><h2>${mission.name}</h2>
    <p>Target: ${mission.target.name}. Fly to the target, fend off fighters from the gun stations,
    survive the flak, then drop your bombs.</p>
    <div class="rows">PILOT: fly with the throttle &nbsp;·&nbsp; GUNS: drag to aim, tap to fire</div>
    <button class="scrn-btn" id="takeoff">TAKE OFF</button>`;
  screenEl.querySelector('#takeoff').addEventListener('click', takeOff);
}
function takeOff() {
  Object.assign(state, { phase: 'cruise', throttle: 1, fuel: 100, health: 100, score: 0, kills: 0, position: 0, hitFlash: 0, bomb: null, result: null });
  state._waves = new Set(); state._warned = {}; state._flakT = 0;
  for (const f of fighters) { f.userData.alive = false; f.visible = false; }
  if (target) { eng.scene.remove(target); target = null; }
  screenEl.style.display = 'none'; barEl.style.display = 'flex';
  switchTo('pilot');
  pushRadio(state, 'Wheels up — climbing out. Watch your throttle.', 'info');
}
function enterBombRun() {
  state.phase = 'bombrun'; state.mode = 'bombrun';
  barEl.style.display = 'none'; gun.visible = false;
  for (const f of fighters) { f.userData.alive = false; f.visible = false; }
  camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');     // look straight down
  target = makeTarget(); target.position.set(0, -700, -1700); eng.scene.add(target);
  state.bomb = { dropped: false, result: null, speed: 240, t: 0 };
  dropBtn.style.display = 'block';
  pushRadio(state, 'On the bomb run — steady... steady...', 'warn');
}
function dropBombs() {
  const b = state.bomb; if (!b || b.dropped || !target) return;
  b.dropped = true; dropBtn.style.display = 'none';
  const v = new THREE.Vector3(); target.getWorldPosition(v); v.project(camera);
  const dist = Math.hypot(v.x, v.y);
  const hit = dist < 0.2 && Math.abs(v.z) < 1;
  b.result = { hit, accuracy: hit ? Math.max(0, 1 - dist / 0.2) : 0 };
  burst(new THREE.Vector3(target.position.x, target.position.y + 20, target.position.z));
  pushRadio(state, hit ? 'Bombs away — direct hit!' : 'Bombs away — we missed!', hit ? 'info' : 'alert');
  setTimeout(() => enterResults(true), 1800);
}
dropBtn.addEventListener('click', dropBombs);

function enterResults(reached) {
  const s = mission.scoring;
  const r = state.bomb && state.bomb.result;
  const survived = state.health > 0;
  let score = state.kills * (s?.fighterKill || 120);
  const rows = [`Fighters downed (${state.kills}) — +${state.kills * (s?.fighterKill || 120)}`];
  if (r && r.hit) { const acc = Math.round((s?.accuracyBonus || 800) * r.accuracy); score += (s?.bombHit || 1000) + acc; rows.push(`Target destroyed — +${s?.bombHit || 1000}`, `Accuracy ${Math.round(r.accuracy * 100)}% — +${acc}`); }
  else if (reached) rows.push('Target missed — +0');
  if (survived) { const sv = Math.round((s?.survivalBonus || 600) * state.health / 100); const fu = Math.round((s?.fuelBonus || 4) * state.fuel); score += sv + fu; rows.push(`Made it home (${Math.round(state.health)}% hull) — +${sv}`, `Fuel reserve (${Math.round(state.fuel)}%) — +${fu}`); }
  state.won = survived; state.result = { score, targetHit: !!(r && r.hit) };
  state.phase = 'results'; barEl.style.display = 'none'; dropBtn.style.display = 'none';
  if (target) { eng.scene.remove(target); target = null; }
  screenEl.style.display = 'flex';
  screenEl.innerHTML = `<h1 style="color:${survived ? '#5fc77a' : '#e0584a'}">${survived ? 'MISSION COMPLETE' : 'FORTRESS LOST'}</h1>
    <h2>${state.result.targetHit ? 'Target destroyed' : 'Target survived'}</h2>
    <div class="rows">${rows.join('<br>')}</div>
    <h2 style="color:#e6b84d">SCORE ${score.toLocaleString()}</h2>
    <button class="scrn-btn" id="again">FLY AGAIN</button>`;
  screenEl.querySelector('#again').addEventListener('click', showBriefing);
}

// --- Overlay sizing -----------------------------------------------------------
let W = 0, H = 0;
function resizeOverlay() { const dpr = Math.min(devicePixelRatio, 2); W = innerWidth; H = innerHeight; overlay.width = W * dpr; overlay.height = H * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0); }
addEventListener('resize', resizeOverlay); resizeOverlay();

// --- Loop ---------------------------------------------------------------------
let cockpitReady = false;
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  eng.updateClouds(dt, state.throttle);
  updateRadio(state, dt);
  state.heading = Math.round(((-camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
  state.speed = Math.round(state.throttle * 180);
  if (state.hitFlash > 0) state.hitFlash = Math.max(0, state.hitFlash - dt * 1.6);

  if (state.phase === 'cruise') updateCruise(dt);
  else if (state.phase === 'bombrun') updateBombRun(dt);

  for (const f of fighters) {
    if (!f.userData.alive) continue;
    f.position.addScaledVector(f.userData.vel, dt);
    f.lookAt(f.position.clone().add(f.userData.vel));
    if (f.position.length() > 1300) { f.userData.alive = false; f.visible = false; }
  }
  for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.userData.life -= dt; b.scale.multiplyScalar(1 + dt * 4); b.material.opacity = Math.max(0, b.userData.life / 0.5); if (b.userData.life <= 0) { eng.scene.remove(b); bursts.splice(i, 1); } }

  eng.render();
  drawOverlay();
  requestAnimationFrame(tick);
}

function updateCruise(dt) {
  state.position = Math.min(mission.distance, state.position + state.throttle * CRUISE_RATE * dt);
  state.fuel = Math.max(0, state.fuel - 0.4 * state.throttle * dt);
  if (state.fuel <= 0) state.health = 0;
  state.altitude = 25000;

  // Waves (capped concurrent).
  mission.waves.forEach((w, i) => {
    if (!state._waves.has(i) && state.position >= w.at) {
      state._waves.add(i);
      for (let k = 0; k < (w.count || 1); k++) if (liveCount() < 3) spawnFromArc(w.arc);
    }
  });

  // Fighter attacks.
  for (const f of fighters) {
    if (!f.userData.alive) continue;
    f.userData.atk -= dt;
    if (f.userData.atk <= 0 && f.position.length() < 620) { f.userData.atk = 4 + Math.random() * 4; damage(6, 'Fighter on us — taking hits!'); }
  }

  // Flak near the target.
  const z = mission.flakZones && mission.flakZones[0];
  if (z && state.position >= z.from && state.position <= z.to) {
    if (!state._warned.flak) { state._warned.flak = true; pushRadio(state, 'Flak ahead — hold her steady!', 'warn'); }
    state._flakT -= dt;
    if (state._flakT <= 0) { state._flakT = 0.7 + Math.random(); if (Math.random() < z.intensity * 0.5) damage(7, 'Flak burst — she\'s rattling!'); }
  }

  if (!state._warned.fuel && state.fuel < 25) { state._warned.fuel = true; pushRadio(state, 'Fuel\'s getting low!', 'warn'); }
  if (state.health <= 0) { enterResults(false); return; }
  if (state.position >= mission.distance) enterBombRun();
}

function damage(n, msg) { state.health = Math.max(0, state.health - n); state.hitFlash = Math.min(1, state.hitFlash + 0.7); if (msg) pushRadio(state, msg, 'alert'); }

function updateBombRun(dt) {
  const b = state.bomb; if (!b) return;
  if (!b.dropped && target) {
    target.position.z += b.speed * dt;
    if (target.position.z > 1400) { b.dropped = true; b.result = { hit: false, accuracy: 0 }; pushRadio(state, 'Target slipped past — no drop!', 'alert'); setTimeout(() => enterResults(true), 1200); }
  }
}

// --- Overlay drawing ----------------------------------------------------------
function drawOverlay() {
  if (state.phase === 'briefing' || state.phase === 'results') { octx.clearRect(0, 0, W, H); return; }
  if (state.phase === 'bombrun') drawBombsight();
  else if (state.mode === 'pilot') { if (cockpitReady) drawCockpit(octx, W, H, state); else octx.clearRect(0, 0, W, H); }
  else drawGunFrame(octx, W, H, state);

  if (state.phase !== 'bombrun') { drawStatus(); }
  drawRadio();
  if (state.hitFlash > 0) { const g = octx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8); g.addColorStop(0, 'rgba(224,88,74,0)'); g.addColorStop(1, `rgba(224,88,74,${0.5 * state.hitFlash})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H); }
}

function drawBombsight() {
  octx.clearRect(0, 0, W, H);
  octx.strokeStyle = 'rgba(255,255,255,0.9)'; octx.lineWidth = 2;
  const r = Math.min(W, H) * 0.12;
  octx.beginPath(); octx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  octx.moveTo(W / 2 - r - 18, H / 2); octx.lineTo(W / 2 + r + 18, H / 2);
  octx.moveTo(W / 2, H / 2 - r - 18); octx.lineTo(W / 2, H / 2 + r + 18); octx.stroke();
  octx.fillStyle = '#dfeaf2'; octx.textAlign = 'center'; octx.font = `bold ${Math.max(14, H * 0.03)}px "Courier New", monospace`;
  octx.fillText(state.bomb && state.bomb.dropped ? (state.bomb.result && state.bomb.result.hit ? 'DIRECT HIT!' : 'MISSED') : 'Line up the target, then DROP', W / 2, H * 0.12);
  octx.textAlign = 'left';
  drawStatus();
}

function drawStatus() {
  const fs = Math.max(12, H * 0.026), bw = fs * 8, x = W - bw - 8, y = 30;
  octx.font = `bold ${fs}px "Courier New", monospace`;
  octx.fillStyle = 'rgba(6,10,14,0.6)'; rr(x, y, bw, fs * 4.4, 6); octx.fill();
  bar(x + 6, y + 6, bw - 12, fs * 0.9, state.health / 100, state.health > 40 ? '#5fc77a' : '#e0584a', `HULL ${Math.round(state.health)}%`);
  bar(x + 6, y + 6 + fs * 1.3, bw - 12, fs * 0.9, state.fuel / 100, state.fuel > 30 ? '#5fc77a' : '#e6b84d', `FUEL ${Math.round(state.fuel)}%`);
  bar(x + 6, y + 6 + fs * 2.6, bw - 12, fs * 0.9, state.position / mission.distance, '#7fb0e0', `TARGET ${Math.round(state.position / mission.distance * 100)}%`);
}
function bar(x, y, w, h, f, col, label) {
  octx.fillStyle = 'rgba(0,0,0,0.4)'; rr(x, y, w, h, 3); octx.fill();
  octx.fillStyle = col; rr(x, y, w * Math.max(0, Math.min(1, f)), h, 3); octx.fill();
  octx.fillStyle = '#eaf2f8'; octx.font = `bold ${h * 0.82}px "Courier New", monospace`; octx.textAlign = 'left'; octx.fillText(label, x + 4, y + h * 0.82);
}
function drawRadio() {
  if (!state.radio.length) return;
  const fs = Math.max(12, H * 0.026), lh = fs * 1.35, baseY = H - (state.phase === 'cruise' && state.mode !== 'pilot' ? 40 : 30);
  octx.font = `bold ${fs}px "Courier New", monospace`; octx.textAlign = 'center';
  const n = state.radio.length;
  for (let i = 0; i < n; i++) {
    const m = state.radio[i], y = baseY - (n - 1 - i) * lh, al = Math.min(1, m.t / 1.5);
    const c = m.level === 'alert' ? '224,88,74' : m.level === 'warn' ? '230,184,77' : '215,227,236';
    const tw = octx.measureText(m.text).width + 20;
    octx.fillStyle = `rgba(0,0,0,${0.4 * al})`; rr(W / 2 - tw / 2, y - fs, tw, fs * 1.3, 4); octx.fill();
    octx.fillStyle = `rgba(${c},${al})`; octx.fillText(m.text, W / 2, y);
  }
  octx.textAlign = 'left';
}
function rr(x, y, w, h, r) { octx.beginPath(); octx.moveTo(x + r, y); octx.arcTo(x + w, y, x + w, y + h, r); octx.arcTo(x + w, y + h, x, y + h, r); octx.arcTo(x, y + h, x, y, r); octx.arcTo(x, y, x + w, y, r); octx.closePath(); }

loadCockpit('./assets/cockpit.jpg').then(() => { cockpitReady = true; });
showBriefing();
requestAnimationFrame(tick);

window.__game = { eng, camera, state, fighters, switchTo, fire, takeOff, enterBombRun, dropBombs, enterResults };
