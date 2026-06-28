// 3D gun station preview: swing the turret to look out the fuselage window,
// the twin .50 cal + ring sight follow your view, tap to shoot fighters.
// Terrain, formation B-17s, and sky from the shared engine.

import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createTerrain } from './terrain.js';
import { makeFighter, makeBomber } from './aircraft.js';
import { drawGunFrame } from './frame2d.js';

const glCanvas = document.getElementById('c');
const overlay = document.getElementById('o');
const octx = overlay.getContext('2d');

const eng = createEngine(glCanvas, { deck: false });
const camera = eng.camera;
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.12;
eng.scene.add(camera);
createTerrain(eng.scene);

// --- Gun + ring sight (parented to the camera) --------------------------------
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.5, roughness: 0.6 });
function barrel(x) {
  const g = new THREE.Group();
  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 14), gunMat);
  jacket.rotation.x = -Math.PI / 2; jacket.position.set(x, -0.45, -1.05);
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), gunMat);
  recv.position.set(x, -0.45, -0.3);
  g.add(jacket, recv); return g;
}
const gun = new THREE.Group();
gun.add(barrel(-0.16), barrel(0.16));
const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.32), new THREE.MeshStandardMaterial({ color: 0x12161a }));
cradle.position.set(0, -0.55, -0.12); gun.add(cradle);
camera.add(gun);

const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a4d });
const sight = new THREE.Group();
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.011, 8, 28), ringMat); ring.position.set(0, -0.16, -1.7);
const bead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), ringMat); bead.position.set(0, -0.16, -1.7);
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), ringMat); post.position.set(0, -0.24, -1.7);
sight.add(ring, bead, post); camera.add(sight);

// --- Formation B-17s ----------------------------------------------------------
const formation = [];
for (const p of [[-130, -35, -230], [165, 5, -380], [-320, 30, -640]]) {
  const b = makeBomber(); b.position.set(...p); b.rotation.y = Math.PI; b.scale.setScalar(1.5); eng.scene.add(b); formation.push(b);
}

// --- Enemy fighters -----------------------------------------------------------
const fighters = [];
function resetFighter(f) {
  const a = Math.random() * Math.PI * 2, d = 380 + Math.random() * 420;
  f.position.set(Math.cos(a) * d, (Math.random() - 0.3) * 240, Math.sin(a) * d);
  const tan = new THREE.Vector3(-Math.sin(a), (Math.random() - 0.5) * 0.2, Math.cos(a)).multiplyScalar(55 + Math.random() * 45);
  f.userData.vel = tan; f.userData.alive = true; f.visible = true; f.scale.setScalar(2.0);
}
for (let i = 0; i < 6; i++) { const f = makeFighter(); resetFighter(f); eng.scene.add(f); fighters.push(f); }

const bursts = [];
function burst(pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true }));
  m.position.copy(pos); m.userData.life = 0.5; eng.scene.add(m); bursts.push(m);
}

// --- Input: drag to aim, tap to fire ------------------------------------------
const raycaster = new THREE.Raycaster();
let dragging = false, lastX = 0, lastY = 0, moved = 0, pid = null;
const SENS = 0.0035;
const state = { time: '07:54', altitude: 25000, speed: 232, heading: 0, score: 0 };

overlay.addEventListener('pointerdown', (e) => { dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0; overlay.setPointerCapture(e.pointerId); });
overlay.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  camera.rotation.y -= dx * SENS;
  camera.rotation.x = Math.max(-0.95, Math.min(0.5, camera.rotation.x - dy * SENS));
});
overlay.addEventListener('pointerup', (e) => { if (e.pointerId === pid && moved < 8) fire(); dragging = false; pid = null; });

function fire() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(fighters, true);
  let hit = null;
  for (const h of hits) { let o = h.object; while (o && fighters.indexOf(o) === -1) o = o.parent; if (o && o.userData.alive) { hit = o; break; } }
  if (hit) { hit.userData.alive = false; hit.visible = false; burst(hit.position); state.score++; setTimeout(() => resetFighter(hit), 700); }
  ring.material.color.set(0xffe08a); setTimeout(() => ring.material.color.set(0xff5a4d), 60);
}

// --- Overlay sizing -----------------------------------------------------------
let W = 0, H = 0;
function resizeOverlay() {
  const dpr = Math.min(devicePixelRatio, 2); W = innerWidth; H = innerHeight;
  overlay.width = W * dpr; overlay.height = H * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resizeOverlay); resizeOverlay();

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  eng.updateClouds(dt, 1);
  for (const f of fighters) {
    if (!f.userData.alive) continue;
    f.position.addScaledVector(f.userData.vel, dt);
    f.lookAt(f.position.clone().add(f.userData.vel));
    if (f.position.length() > 1500) resetFighter(f);
  }
  for (let i = 0; i < formation.length; i++) formation[i].position.y += Math.sin(now / 1000 + i) * 0.02;
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.userData.life -= dt; b.scale.multiplyScalar(1 + dt * 4); b.material.opacity = Math.max(0, b.userData.life / 0.5);
    if (b.userData.life <= 0) { eng.scene.remove(b); bursts.splice(i, 1); }
  }
  state.heading = ((-camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360;
  eng.render();
  drawGunFrame(octx, W, H, state);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__gun = { eng, fighters, state, fire, camera };
