// Unified 3D B-17 — full mission: briefing -> take off -> cruise (man the
// cockpit + gun stations, fight off realistic fighter passes, survive flak) ->
// 3D bomb run over a city -> results. One Three.js scene; reuses the radio +
// mission data.

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
const dropBtn = document.getElementById('drop');
const screenEl = document.getElementById('screen');

const eng = createEngine(glCanvas, { deck: false });
const camera = eng.camera;
camera.rotation.order = 'YXZ';
eng.scene.add(camera);
createTerrain(eng.scene);

const mission = getMission(0);
const CRUISE_RATE = 1.9;            // route units/sec at full throttle (slower)

const STATIONS = {
  pilot: { yaw: 0, pitch: -0.04, pilot: true, yawCone: 0.34, pitchCone: 0.2 },
  nose: { yaw: 0, pitch: -0.05, yawCone: 0.7, pitchCone: 0.7 },
  top: { yaw: 0, pitch: 0.4, yawCone: 0.8, pitchCone: 0.6 },
  ball: { yaw: 0, pitch: -0.75, yawCone: 0.7, pitchCone: 0.5 },
  tail: { yaw: Math.PI, pitch: -0.05, yawCone: 0.7, pitchCone: 0.6 },
  waistL: { yaw: -Math.PI / 2, pitch: -0.05, yawCone: 0.7, pitchCone: 0.6 },
  waistR: { yaw: Math.PI / 2, pitch: -0.05, yawCone: 0.7, pitchCone: 0.6 },
};
const ARC_DIR = {
  FRONT: [0, 0, -1], REAR: [0, 0, 1], LEFT: [-1, 0, 0], RIGHT: [1, 0, 0],
  HIGH: [0, 1, -0.3], LOW: [0, -1, 0.3],
};
const ARC_STATION = { FRONT: 'nose', REAR: 'tail', LEFT: 'waistL', RIGHT: 'waistR', HIGH: 'top', LOW: 'ball' };

const state = {
  phase: 'briefing', mode: 'pilot', throttle: 1.0, fuel: 100, health: 100,
  score: 0, kills: 0, position: 0, altitude: 25000, speed: 232, heading: 0,
  time: '07:54', radio: [], hitFlash: 0,
  base: { yaw: 0, pitch: -0.04, yawCone: 0.34, pitchCone: 0.2 },
  lookYaw: 0, lookPitch: 0, lookDX: 0, lookDY: 0, climb: 0,
  bomb: null, result: null, won: false, bombEta: 0,
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

const _v = new THREE.Vector3();
function spawnFromArc(arc) {
  const f = fighters.find((x) => !x.userData.alive); if (!f) return;
  const d = new THREE.Vector3(...(ARC_DIR[arc] || [0, 0, -1])).normalize();
  const tan = new THREE.Vector3(-d.z, 0, d.x);
  // Start far out along the arc, with a lateral offset so the run curves in.
  f.position.copy(d).multiplyScalar(560 + Math.random() * 200)
    .addScaledVector(tan, (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 120))
    .add(new THREE.Vector3(0, (Math.random() - 0.5) * 120, 0));
  f.userData.alive = true; f.visible = true;
  f.userData.arc = arc;
  f.userData.phase = 'approach';
  f.userData.speed = 52 + Math.random() * 26;          // slow closing speed — trackable
  f.userData.vel = _v.copy(d).multiplyScalar(-f.userData.speed);
  f.userData.fired = false;
  f.userData.roll = 0;
  // Aim at a point just off the bomber so passes look like gun runs, not rams.
  f.userData.aim = new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60);
  radioBandit(state, arc);
}

const bursts = [];
function burst(p, col = 0xffb13c, size = 7) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true }));
  m.position.copy(p); m.userData.life = 0.5; eng.scene.add(m); bursts.push(m);
}

// --- Bomb-run city ------------------------------------------------------------
let city = null, factory = null;
function makeCity() {
  const g = new THREE.Group();
  // Ground slab with a street-grid / fields texture.
  const tex = cityTexture();
  tex.anisotropy = 8;                                  // one coherent layout, no tiling
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; g.add(ground);

  const roof = new THREE.MeshStandardMaterial({ color: 0x6a6f63, roughness: 1 });
  const roofDark = new THREE.MeshStandardMaterial({ color: 0x4c5048, roughness: 1 });
  // Blocks of buildings on a grid, leaving roads clear.
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -8; gz <= 8; gz++) {
      if (Math.abs(gx) === 0 || gz % 3 === 0) continue;        // streets
      if (Math.random() < 0.25) continue;
      const h = 8 + Math.random() * 26;
      const b = new THREE.Mesh(new THREE.BoxGeometry(34 + Math.random() * 16, h, 34 + Math.random() * 16), Math.random() < 0.5 ? roof : roofDark);
      b.position.set(gx * 90 + (Math.random() - 0.5) * 20, h / 2, gz * 130 + (Math.random() - 0.5) * 20);
      g.add(b);
    }
  }
  // The target: a long assembly hall with a sawtooth roof and two chimneys.
  factory = buildFactory();
  factory.position.set(-90, 0, 120);
  g.add(factory);
  g.position.set(0, -700, -1700);
  return g;
}
function buildFactory() {
  const f = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x8a8170, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x55503f, roughness: 1 });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(220, 30, 70), wall); hall.position.y = 15; f.add(hall);
  for (let i = 0; i < 7; i++) {                                  // sawtooth roof ridges
    const t = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 70), dark);
    t.position.set(-90 + i * 30, 33, 0); t.rotation.z = 0.2; f.add(t);
  }
  for (const x of [-70, 70]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 70, 12), dark); c.position.set(x, 35, -45); f.add(c); }
  const yard = new THREE.Mesh(new THREE.BoxGeometry(280, 1, 150), new THREE.MeshStandardMaterial({ color: 0x3f4138, roughness: 1 }));
  yard.position.set(0, 0.6, 0); f.add(yard);
  return f;
}
function cityTexture() {
  const N = 512; const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  x.fillStyle = '#5d6b3a'; x.fillRect(0, 0, N, N);              // fields base
  // outskirt fields
  const pal = ['#7c8a50', '#93a05f', '#67753f', '#8a9657', '#9caa66'];
  for (let i = 0; i < 70; i++) { x.fillStyle = pal[i % pal.length]; const s = 26 + Math.random() * 50; x.fillRect(Math.random() * N, Math.random() * N, s, s); }
  // city block area (center) in greys with a road grid
  x.fillStyle = '#6c7068'; x.fillRect(N * 0.2, N * 0.18, N * 0.6, N * 0.64);
  x.strokeStyle = '#33352f'; x.lineWidth = 4;
  for (let i = 0; i <= 6; i++) { const p = N * 0.2 + (N * 0.6) * i / 6; x.beginPath(); x.moveTo(p, N * 0.18); x.lineTo(p, N * 0.82); x.stroke(); }
  for (let i = 0; i <= 7; i++) { const p = N * 0.18 + (N * 0.64) * i / 7; x.beginPath(); x.moveTo(N * 0.2, p); x.lineTo(N * 0.8, p); x.stroke(); }
  // building footprints
  for (let i = 0; i < 120; i++) { x.fillStyle = Math.random() < 0.5 ? '#7d8278' : '#5b5f55'; x.fillRect(N * 0.21 + Math.random() * N * 0.57, N * 0.19 + Math.random() * N * 0.6, 10 + Math.random() * 16, 10 + Math.random() * 16); }
  // river
  x.strokeStyle = '#4d6f93'; x.lineWidth = 14; x.lineCap = 'round'; x.beginPath();
  for (let y = 0; y <= N; y += 16) { const xx = N * 0.62 + Math.sin(y * 0.025) * N * 0.12; y === 0 ? x.moveTo(xx, y) : x.lineTo(xx, y); }
  x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// --- Station switching --------------------------------------------------------
function switchTo(id) {
  const s = STATIONS[id]; if (!s || state.phase !== 'cruise') return;
  state.mode = id;
  state.base = { yaw: s.yaw, pitch: s.pitch, yawCone: s.yawCone || 0.7, pitchCone: s.pitchCone || 0.6 };
  state.lookYaw = 0; state.lookPitch = 0; state.lookDX = 0; state.lookDY = 0;
  camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
  gun.visible = !s.pilot;
}

// --- Plane-diagram station selector (drawn on the overlay, tappable) ----------
let diagramHotspots = [];
const DIAG_POS = {                                  // normalized within the diagram box
  nose: [0.5, 0.06], pilot: [0.5, 0.2], top: [0.5, 0.36], ball: [0.5, 0.52],
  waistL: [0.26, 0.6], waistR: [0.74, 0.6], tail: [0.5, 0.93],
};
function threatStations() {
  const set = new Set();
  for (const f of fighters) if (f.userData.alive && f.userData.phase === 'approach') set.add(ARC_STATION[f.userData.arc]);
  return set;
}
function drawPlaneDiagram(ctx, W, H, t) {
  const DW = Math.max(120, Math.min(W * 0.2, 200));
  const DH = DW * 1.9;
  const ox = 12, oy = H - DH - 12;
  diagramHotspots = [];

  ctx.save();
  ctx.fillStyle = 'rgba(8,12,16,0.5)'; rr(ctx, ox - 6, oy - 6, DW + 12, DH + 12, 12); ctx.fill();

  // B-17 plan-view silhouette (nose up).
  const cx = ox + DW / 2;
  ctx.fillStyle = 'rgba(150,165,178,0.5)'; ctx.strokeStyle = 'rgba(190,205,218,0.7)'; ctx.lineWidth = 2;
  // fuselage
  ctx.beginPath(); ctx.ellipse(cx, oy + DH * 0.5, DW * 0.09, DH * 0.46, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // wings
  ctx.fillRect(ox + DW * 0.04, oy + DH * 0.38, DW * 0.92, DH * 0.07);
  ctx.strokeRect(ox + DW * 0.04, oy + DH * 0.38, DW * 0.92, DH * 0.07);
  // tailplane
  ctx.fillRect(ox + DW * 0.26, oy + DH * 0.86, DW * 0.48, DH * 0.05);
  ctx.strokeRect(ox + DW * 0.26, oy + DH * 0.86, DW * 0.48, DH * 0.05);

  const threats = threatStations();
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  for (const id of Object.keys(DIAG_POS)) {
    const [nx, ny] = DIAG_POS[id];
    const sx = ox + nx * DW, sy = oy + ny * DH;
    const rDot = Math.max(11, DW * 0.085);
    const active = state.mode === id;
    const threat = threats.has(id);
    ctx.beginPath(); ctx.arc(sx, sy, rDot, 0, Math.PI * 2);
    if (active) ctx.fillStyle = '#5fc77a';
    else if (threat) ctx.fillStyle = `rgba(${230},${70 + pulse * 40},${60},${0.55 + pulse * 0.45})`;
    else ctx.fillStyle = 'rgba(20,28,36,0.9)';
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = active ? '#cfe' : threat ? '#ffd0c8' : 'rgba(150,170,185,0.8)'; ctx.stroke();
    if (threat && !active) { ctx.beginPath(); ctx.arc(sx, sy, rDot + 3 + pulse * 4, 0, Math.PI * 2); ctx.strokeStyle = `rgba(230,80,60,${0.6 * (1 - pulse)})`; ctx.stroke(); }
    ctx.fillStyle = active ? '#08110a' : '#dfeaf2';
    ctx.font = `bold ${Math.max(8, DW * 0.07)}px "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LABEL[id], sx, sy);
    diagramHotspots.push({ id, sx, sy, r: rDot + 6 });
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8aa0ad'; ctx.font = `bold ${Math.max(8, DW * 0.07)}px "Courier New", monospace`;
  ctx.fillText('TAP A STATION', ox, oy - 10);
  ctx.restore();
}
const LABEL = { nose: 'NOS', pilot: 'PLT', top: 'TOP', ball: 'BAL', waistL: 'LW', waistR: 'RW', tail: 'TAL' };
function diagramHit(x, y) {
  for (const h of diagramHotspots) { if (Math.hypot(x - h.sx, y - h.sy) <= h.r) return h.id; }
  return null;
}

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
  if (state.mode === 'pilot') {
    if (onThrottle) { state.throttle = clamp(state.throttle - dy * 0.004, 0.7, 1.4); return; }
    // Look around the cockpit: pans the photo (parallax) and the world together.
    state.lookYaw = clamp(state.lookYaw - dx * SENS, -state.base.yawCone, state.base.yawCone);
    state.lookPitch = clamp(state.lookPitch - dy * SENS, -state.base.pitchCone, state.base.pitchCone);
  } else {
    state.lookYaw = clamp(state.lookYaw - dx * SENS, -state.base.yawCone, state.base.yawCone);
    state.lookPitch = clamp(state.lookPitch - dy * SENS, -state.base.pitchCone, state.base.pitchCone);
  }
});
overlay.addEventListener('pointerup', (e) => {
  if (e.pointerId === pid && moved < 9 && state.phase === 'cruise') {
    const id = diagramHit(e.clientX, e.clientY);
    if (id) switchTo(id);
    else if (state.mode !== 'pilot') fire();
  }
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
  dropBtn.style.display = 'none';
  screenEl.style.display = 'flex';
  screenEl.innerHTML = `<h1>MISSION BRIEFING</h1><h2>${mission.name}</h2>
    <p>Target: <b>${mission.target.name}</b> — ${mission.target.description} Study the recon photo: in the bomb run you must pick it out yourself.</p>
    <canvas id="recon" width="440" height="240" style="max-width:78vw;border:1px solid #33424f;border-radius:8px;background:#26341f"></canvas>
    <div class="rows">PILOT: drag to look around · drag the throttle to fly &nbsp;·&nbsp; GUNS: tap a station on the plane, drag to aim, tap to fire</div>
    <button class="scrn-btn" id="takeoff">TAKE OFF</button>`;
  drawRecon(screenEl.querySelector('#recon'));
  screenEl.querySelector('#takeoff').addEventListener('click', takeOff);
}
function drawRecon(cv) {
  if (!cv) return; const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.fillStyle = '#33402a'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) { x.fillStyle = ['#3c4a2f', '#46552f', '#586a3a'][i % 3]; const s = 18 + Math.random() * 30; x.fillRect(Math.random() * W, Math.random() * H, s, s); }
  // city blocks
  x.fillStyle = '#6c7068'; x.fillRect(W * 0.18, H * 0.16, W * 0.64, H * 0.66);
  x.strokeStyle = '#2c2e28'; x.lineWidth = 2;
  for (let i = 0; i <= 6; i++) { const p = W * 0.18 + W * 0.64 * i / 6; x.beginPath(); x.moveTo(p, H * 0.16); x.lineTo(p, H * 0.82); x.stroke(); }
  for (let i = 0; i <= 6; i++) { const p = H * 0.16 + H * 0.66 * i / 6; x.beginPath(); x.moveTo(W * 0.18, p); x.lineTo(W * 0.82, p); x.stroke(); }
  for (let i = 0; i < 80; i++) { x.fillStyle = Math.random() < 0.5 ? '#7d8278' : '#565a50'; x.fillRect(W * 0.19 + Math.random() * W * 0.6, H * 0.17 + Math.random() * H * 0.62, 7, 7); }
  // river
  x.strokeStyle = '#4d6f93'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath();
  for (let y = 0; y <= H; y += 10) { const xx = W * 0.66 + Math.sin(y * 0.04) * W * 0.07; y === 0 ? x.moveTo(xx, y) : x.lineTo(xx, y); }
  x.stroke();
  // THE FACTORY (matches the 3D target): long hall, sawtooth roof, 2 chimneys
  const fx = W * 0.36, fy = H * 0.5, fw = W * 0.3, fh = H * 0.12;
  x.fillStyle = '#b9b09a'; x.fillRect(fx, fy, fw, fh);
  x.fillStyle = '#7a715a'; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(fx + i * fw / 7, fy); x.lineTo(fx + i * fw / 7 + fw / 14, fy - fh * 0.5); x.lineTo(fx + (i + 1) * fw / 7, fy); x.fill(); }
  x.fillStyle = '#3a3a32'; x.beginPath(); x.arc(fx + fw * 0.2, fy + fh * 1.2, 5, 0, 7); x.arc(fx + fw * 0.8, fy + fh * 1.2, 5, 0, 7); x.fill();
  // callout
  x.strokeStyle = '#e6b84d'; x.lineWidth = 2; x.strokeRect(fx - 6, fy - fh * 0.6, fw + 12, fh * 1.9);
  x.fillStyle = '#e6b84d'; x.font = 'bold 14px "Courier New", monospace'; x.textAlign = 'center';
  x.fillText('BALL-BEARING WORKS', W / 2, H * 0.93);
}
function takeOff() {
  Object.assign(state, { phase: 'cruise', throttle: 1, fuel: 100, health: 100, score: 0, kills: 0, position: 0, hitFlash: 0, bomb: null, result: null, climb: 1 });
  state._waves = new Set(); state._warned = {}; state._flakT = 0;
  for (const f of fighters) { f.userData.alive = false; f.visible = false; }
  if (city) { eng.scene.remove(city); city = null; factory = null; }
  screenEl.style.display = 'none';
  switchTo('pilot');
  pushRadio(state, 'Wheels up — climbing out. Watch your throttle.', 'info');
}
function enterBombRun() {
  state.phase = 'bombrun'; state.mode = 'bombrun';
  gun.visible = false;
  for (const f of fighters) { f.userData.alive = false; f.visible = false; }
  camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');     // look straight down
  city = makeCity(); eng.scene.add(city);
  state.bomb = { dropped: false, result: null, speed: 150, t: 0 };
  dropBtn.style.display = 'block';
  pushRadio(state, 'On the bomb run — find the works and line it up.', 'warn');
}
function dropBombs() {
  const b = state.bomb; if (!b || b.dropped || !factory) return;
  b.dropped = true; dropBtn.style.display = 'none';
  factory.getWorldPosition(_v); _v.project(camera);
  const dist = Math.hypot(_v.x, _v.y);
  const hit = dist < 0.16 && Math.abs(_v.z) < 1;
  b.result = { hit, accuracy: hit ? Math.max(0, 1 - dist / 0.16) : 0 };
  factory.getWorldPosition(_v); burst(_v.clone().add(new THREE.Vector3(0, 20, 0)), hit ? 0xffd14a : 0xcccccc, 14);
  pushRadio(state, hit ? 'Bombs away — direct hit on the works!' : 'Bombs away — we missed the target!', hit ? 'info' : 'alert');
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
  state.phase = 'results'; dropBtn.style.display = 'none';
  if (city) { eng.scene.remove(city); city = null; factory = null; }
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
let clock = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  eng.updateClouds(dt, state.throttle);
  updateRadio(state, dt);

  // Apply look offsets to the camera (cruise only).
  if (state.phase === 'cruise') {
    if (state.climb > 0) state.climb = Math.max(0, state.climb - dt * 0.28);
    camera.rotation.y = state.base.yaw + state.lookYaw;
    camera.rotation.x = state.base.pitch + state.lookPitch + (state.mode === 'pilot' ? state.climb * 0.16 : 0);
    state.lookDX = state.lookYaw; state.lookDY = state.lookPitch;
  }
  state.heading = Math.round(((-camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
  state.speed = Math.round(state.throttle * 180);
  if (state.hitFlash > 0) state.hitFlash = Math.max(0, state.hitFlash - dt * 1.6);

  if (state.phase === 'cruise') updateCruise(dt);
  else if (state.phase === 'bombrun') updateBombRun(dt);

  updateFighters(dt);
  for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.userData.life -= dt; b.scale.multiplyScalar(1 + dt * 4); b.material.opacity = Math.max(0, b.userData.life / 0.5); if (b.userData.life <= 0) { eng.scene.remove(b); bursts.splice(i, 1); } }

  eng.render();
  drawOverlay();
  requestAnimationFrame(tick);
}

// Realistic fighter passes: curved approach, fire on the pass, break away.
const _desired = new THREE.Vector3(), _tmp = new THREE.Vector3();
function updateFighters(dt) {
  for (const f of fighters) {
    const u = f.userData; if (!u.alive) continue;
    const dist = f.position.length();
    if (u.phase === 'approach') {
      _desired.copy(u.aim).sub(f.position).normalize().multiplyScalar(u.speed);
      if (dist < 150 && !u.fired) {
        u.fired = true;
        if (state.phase === 'cruise') damage(3 + Math.random() * 2, 'Fighter pass — we\'re hit!');
        // break away: peel off to the side and climb out
        u.phase = 'breakaway';
        const side = new THREE.Vector3(-f.position.z, 0, f.position.x).normalize();
        u.aim.copy(f.position).addScaledVector(side, 500).add(new THREE.Vector3(0, 260, 0));
      }
    } else { // breakaway
      _desired.copy(u.aim).sub(f.position).normalize().multiplyScalar(u.speed * 1.1);
      if (dist > 760) { u.alive = false; f.visible = false; continue; }
    }
    // Steer velocity toward desired (limited turn rate) -> curved path.
    const turn = 1 - Math.exp(-dt * 2.2);
    u.vel.lerp(_desired, turn);
    f.position.addScaledVector(u.vel, dt);
    // Orient + bank into the turn.
    _tmp.copy(f.position).add(u.vel); f.lookAt(_tmp);
    const lateral = _tmp.copy(u.vel).normalize().cross(_desired.normalize()).y;
    u.roll += ((-lateral * 1.1) - u.roll) * Math.min(1, dt * 4);
    f.rotateZ(u.roll);
  }
}

function updateCruise(dt) {
  state.position = Math.min(mission.distance, state.position + state.throttle * CRUISE_RATE * dt);
  state.fuel = Math.max(0, state.fuel - 0.32 * state.throttle * dt);
  if (state.fuel <= 0) state.health = 0;
  state.altitude = 25000 + state.climb * 1200;
  const remaining = mission.distance - state.position;
  state.bombEta = Math.ceil(remaining / Math.max(0.4, state.throttle * CRUISE_RATE));

  mission.waves.forEach((w, i) => {
    if (!state._waves.has(i) && state.position >= w.at) {
      state._waves.add(i);
      for (let k = 0; k < (w.count || 1); k++) if (liveCount() < 2) spawnFromArc(w.arc);
    }
  });

  const z = mission.flakZones && mission.flakZones[0];
  if (z && state.position >= z.from && state.position <= z.to) {
    if (!state._warned.flak) { state._warned.flak = true; pushRadio(state, 'Flak ahead — hold her steady!', 'warn'); }
    state._flakT -= dt;
    if (state._flakT <= 0) { state._flakT = 1.4 + Math.random() * 1.2; if (Math.random() < z.intensity * 0.4) damage(4, 'Flak burst — she\'s rattling!'); }
  }

  if (!state._warned.fuel && state.fuel < 25) { state._warned.fuel = true; pushRadio(state, 'Fuel\'s getting low!', 'warn'); }
  if (state.health <= 0) { enterResults(false); return; }
  if (state.position >= mission.distance) enterBombRun();
}

function damage(n, msg) { state.health = Math.max(0, state.health - n); state.hitFlash = Math.min(1, state.hitFlash + 0.6); if (msg) pushRadio(state, msg, 'alert'); }

function updateBombRun(dt) {
  const b = state.bomb; if (!b || !city) return;
  if (!b.dropped) {
    city.position.z += b.speed * dt;
    if (factory) { factory.getWorldPosition(_v); if (_v.z > 1400) { b.dropped = true; b.result = { hit: false, accuracy: 0 }; pushRadio(state, 'Target slipped past — no drop!', 'alert'); setTimeout(() => enterResults(true), 1200); } }
  }
}

// --- Overlay drawing ----------------------------------------------------------
function drawOverlay() {
  if (state.phase === 'briefing' || state.phase === 'results') { octx.clearRect(0, 0, W, H); return; }
  if (state.phase === 'bombrun') { drawBombsight(); return; }
  if (state.mode === 'pilot') { if (cockpitReady) drawCockpit(octx, W, H, state); else octx.clearRect(0, 0, W, H); }
  else drawGunFrame(octx, W, H, state);

  drawPlaneDiagram(octx, W, H, clock);
  drawStatus();
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
  octx.fillText(state.bomb && state.bomb.dropped ? (state.bomb.result && state.bomb.result.hit ? 'DIRECT HIT!' : 'BOMBS AWAY') : 'Find the ball-bearing works · line it up · DROP', W / 2, H * 0.1);
  octx.textAlign = 'left';
  drawStatus();
}

function drawStatus() {
  const fs = Math.max(12, H * 0.026), bw = fs * 8, x = W - bw - 8, y = 30;
  octx.font = `bold ${fs}px "Courier New", monospace`;
  const rows = state.phase === 'bombrun' ? 2 : 3;
  octx.fillStyle = 'rgba(6,10,14,0.6)'; rr(octx, x, y, bw, fs * (rows * 1.45 + 1), 6); octx.fill();
  bar(x + 6, y + 6, bw - 12, fs * 0.9, state.health / 100, state.health > 40 ? '#5fc77a' : '#e0584a', `HULL ${Math.round(state.health)}%`);
  bar(x + 6, y + 6 + fs * 1.3, bw - 12, fs * 0.9, state.fuel / 100, state.fuel > 30 ? '#5fc77a' : '#e6b84d', `FUEL ${Math.round(state.fuel)}%`);
  if (state.phase !== 'bombrun') bar(x + 6, y + 6 + fs * 2.6, bw - 12, fs * 0.9, state.position / mission.distance, '#7fb0e0', `TGT ${Math.round(state.position / mission.distance * 100)}% · ${state.bombEta}s`);
}
function bar(x, y, w, h, f, col, label) {
  octx.fillStyle = 'rgba(0,0,0,0.4)'; rr(octx, x, y, w, h, 3); octx.fill();
  octx.fillStyle = col; rr(octx, x, y, w * Math.max(0, Math.min(1, f)), h, 3); octx.fill();
  octx.fillStyle = '#eaf2f8'; octx.font = `bold ${h * 0.82}px "Courier New", monospace`; octx.textAlign = 'left'; octx.fillText(label, x + 4, y + h * 0.82);
}
function drawRadio() {
  if (!state.radio.length) return;
  const fs = Math.max(12, H * 0.026), lh = fs * 1.4, baseY = H * 0.1;
  octx.font = `bold ${fs}px "Courier New", monospace`; octx.textAlign = 'center';
  const n = state.radio.length;
  for (let i = 0; i < n; i++) {
    const m = state.radio[i], y = baseY + i * lh, al = Math.min(1, m.t / 1.5);
    const c = m.level === 'alert' ? '224,88,74' : m.level === 'warn' ? '230,184,77' : '215,227,236';
    const tw = octx.measureText(m.text).width + 20;
    octx.fillStyle = `rgba(0,0,0,${0.4 * al})`; rr(octx, W / 2 - tw / 2, y - fs, tw, fs * 1.3, 4); octx.fill();
    octx.fillStyle = `rgba(${c},${al})`; octx.fillText(m.text, W / 2, y);
  }
  octx.textAlign = 'left';
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

loadCockpit('./assets/cockpit.jpg').then(() => { cockpitReady = true; });
showBriefing();
requestAnimationFrame(tick);

window.__game = { eng, camera, state, fighters, switchTo, fire, takeOff, enterBombRun, dropBombs, enterResults };
