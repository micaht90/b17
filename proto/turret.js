// B-17 gun turret — 3D prototype (Three.js). Swing the turret to look around,
// the twin .50 cal and ring sight follow your view, tap to fire at fighters.
// Standalone proof-of-concept; not wired into the 2D game.

import * as THREE from 'three';

const canvas = document.getElementById('c');
const scoreEl = document.getElementById('score');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();

// Camera sits inside the turret; a yaw/pitch pivot swings the whole view.
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 4000);
const pivot = new THREE.Group();
pivot.add(camera);
scene.add(pivot);

// --- Sky dome (vertical gradient) + cloud deck below ---------------------------
const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { top: { value: new THREE.Color('#16335c') }, bot: { value: new THREE.Color('#bcd4e6') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h = clamp((normalize(vP).y*0.5+0.5),0.0,1.0); gl_FragColor = vec4(mix(bot, top, h),1.0); }',
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

const deck = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 6000),
  new THREE.MeshStandardMaterial({ color: '#8f9a82' }),
);
deck.rotation.x = -Math.PI / 2;
deck.position.y = -260;
scene.add(deck);

// Drifting cloud puffs over the deck.
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const clouds = [];
for (let i = 0; i < 40; i++) {
  const c = new THREE.Mesh(new THREE.SphereGeometry(40 + Math.random() * 60, 8, 6), cloudMat);
  c.position.set((Math.random() - 0.5) * 3000, -200 + Math.random() * 60, (Math.random() - 0.5) * 3000);
  c.scale.y = 0.4;
  scene.add(c);
  clouds.push(c);
}

scene.add(new THREE.HemisphereLight(0xbfd4ea, 0x55603f, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(1, 1.4, 0.6);
scene.add(sun);

// --- Turret housing + twin .50 cal + ring sight (children of the camera) -------
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.5, roughness: 0.6 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x141a1f, metalness: 0.3, roughness: 0.8 });

function barrel(x) {
  const g = new THREE.Group();
  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 16), gunMat);
  jacket.rotation.x = -Math.PI / 2; jacket.position.set(x, -0.42, -1.0);
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), gunMat);
  recv.position.set(x, -0.42, -0.35);
  g.add(jacket, recv);
  return g;
}
const gun = new THREE.Group();
gun.add(barrel(-0.16), barrel(0.16));
// Twin mount cradle.
const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), frameMat);
cradle.position.set(0, -0.52, -0.15);
gun.add(cradle);
camera.add(gun);

// Ring-and-bead sight.
const sight = new THREE.Group();
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff5a4d }));
ring.position.set(0, -0.18, -1.7);
const bead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a4d }));
bead.position.set(0, -0.18, -1.7);
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4d }));
post.position.set(0, -0.26, -1.7);
sight.add(ring, bead, post);
camera.add(sight);

// Turret canopy ring framing the view.
const canopy = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 10, 40), frameMat);
canopy.position.set(0, -0.1, -2.2);
camera.add(canopy);

// --- Enemy fighters ------------------------------------------------------------
const fighterMat = new THREE.MeshStandardMaterial({ color: 0x23272d, metalness: 0.2, roughness: 0.7 });
const fighters = [];

function makeFighter() {
  const g = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 3, 4, 8), fighterMat);
  fus.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.18, 1.1), fighterMat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.7), fighterMat);
  tail.position.z = 1.7;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.7), fighterMat);
  fin.position.set(0, 0.4, 1.7);
  g.add(fus, wing, tail, fin);
  resetFighter(g);
  scene.add(g);
  fighters.push(g);
  return g;
}

function resetFighter(g) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 600 + Math.random() * 500;
  g.position.set(Math.cos(ang) * dist, (Math.random() - 0.4) * 350, Math.sin(ang) * dist);
  // Fly roughly across the field of play, not straight at the origin.
  const tangent = new THREE.Vector3(-Math.sin(ang), (Math.random() - 0.5) * 0.3, Math.cos(ang));
  g.userData.vel = tangent.multiplyScalar(60 + Math.random() * 40);
  g.userData.alive = true;
  g.scale.setScalar(1);
  g.visible = true;
}
for (let i = 0; i < 6; i++) makeFighter();

// --- Hit effects ---------------------------------------------------------------
const bursts = [];
function spawnBurst(pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true }));
  m.position.copy(pos);
  m.userData.life = 0.5;
  scene.add(m);
  bursts.push(m);
}

// --- Input: drag to aim, tap to fire ------------------------------------------
const raycaster = new THREE.Raycaster();
let dragging = false, lastX = 0, lastY = 0, moved = 0, pid = null;
const SENS = 0.0032;
let score = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  pivot.rotation.y -= dx * SENS;
  pivot.rotation.x = Math.max(-1.0, Math.min(1.0, pivot.rotation.x - dy * SENS));
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId === pid && moved < 8) fire();
  dragging = false; pid = null;
});

function fire() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(fighters, true);
  const live = hits.find((h) => { let o = h.object; while (o && !o.userData.alive) o = o.parent; return o && o.userData.alive; });
  if (live) {
    let o = live.object; while (o && fighters.indexOf(o) === -1) o = o.parent;
    if (o) { o.userData.alive = false; o.visible = false; spawnBurst(o.position); score++; scoreEl.textContent = score; setTimeout(() => resetFighter(o), 600); }
  }
  // Tracer flash on the sight.
  ring.material.color.set(0xffe08a);
  setTimeout(() => ring.material.color.set(0xff5a4d), 60);
}

// --- Loop ----------------------------------------------------------------------
let last = performance.now();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const g of fighters) {
    if (!g.userData.alive) continue;
    g.position.addScaledVector(g.userData.vel, dt);
    g.lookAt(g.position.clone().add(g.userData.vel));
    if (g.position.length() > 1600) resetFighter(g);
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.userData.life -= dt;
    b.scale.multiplyScalar(1 + dt * 4); b.material.opacity = Math.max(0, b.userData.life / 0.5);
    if (b.userData.life <= 0) { scene.remove(b); bursts.splice(i, 1); }
  }
  for (const c of clouds) { c.position.x += dt * 12; if (c.position.x > 1500) c.position.x -= 3000; }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Debug handle for tooling/tests.
window.__proto = { THREE, scene, camera, fighters, fire, getScore: () => score };
