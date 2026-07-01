// Unified 3D B-17 — full mission: briefing -> take off -> cruise (man the
// cockpit + gun stations, fight off realistic fighter passes, survive flak) ->
// 3D bomb run over a city -> results. One Three.js scene; reuses the radio +
// mission data.

import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createTerrain } from './terrain.js';
import { makeFighter, makeBomber } from './aircraft.js';
import { drawGunFrame } from './frame2d.js';
import { loadCockpit, draw as drawCockpit, throttleRectScreen, headPadRectScreen } from './cockpitPhoto.js';
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
const CRUISE_RATE = 1.25;           // route units/sec at full throttle; gives the flight room to breathe

const STATIONS = {
  pilot: { yaw: 0, pitch: -0.04, pilot: true, yawCone: 0.34, pitchCone: 0.2 },
  nose: { yaw: 0, pitch: -0.05, yawCone: 0.7, pitchCone: 0.7 },
  top: { yaw: 0, pitch: 0.35, fullYaw: true, pitchCone: 0.95 },
  ball: { yaw: 0, pitch: -0.65, fullYaw: true, pitchCone: 0.9 },
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
  lookYaw: 0, lookPitch: 0, lookDX: 0, lookDY: 0, headX: 0, headY: 0, headZoom: 0, climb: 0, fireFx: 0,
  gun: null,
  bomb: null, result: null, won: false, bombEta: 0,
  _waves: new Set(), _flakT: 0, _flakVisualT: 0, _warned: {}, flakFlash: 0,
};
const GUNPLAY = {
  ammoStart: 900,
  roundsPerCycle: 2,
  rate: 10.5,
  recoilKick: 0.13,
  recoilRecover: 4.8,
  spreadBase: 0.002,
  spreadRecoil: 0.014,
  damage: 0.34,
};
function makeGunState() {
  return {
    trigger: false,
    fireCooldown: 0,
    ammo: GUNPLAY.ammoStart,
    recoil: 0,
    spread: GUNPLAY.spreadBase,
    hitMarker: 0,
    emptyClick: 0,
    tracers: [],
    sparks: [],
  };
}
state.gun = makeGunState();

// --- Gun + ring sight ---------------------------------------------------------
const gunMat = new THREE.MeshStandardMaterial({ color: 0x171c21, metalness: 0.62, roughness: 0.45 });
const gunEdgeMat = new THREE.MeshStandardMaterial({ color: 0x343c43, metalness: 0.45, roughness: 0.38 });
const beltMat = new THREE.MeshStandardMaterial({ color: 0xb18a48, metalness: 0.55, roughness: 0.35 });
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd36c, transparent: true, opacity: 0.9, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a4d });

function makeGunBarrel(x, muzzleFlashes) {
  const g = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.55), gunMat);
  receiver.position.set(x, -0.49, -0.28);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.05, 0.42), gunEdgeMat);
  cover.position.set(x, -0.36, -0.34);

  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 1.05, 16), gunMat);
  jacket.rotation.x = -Math.PI / 2;
  jacket.position.set(x, -0.48, -0.96);
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.004, 6, 14), gunEdgeMat);
    r.position.set(x, -0.48, -0.56 - i * 0.11);
    g.add(r);
  }

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.92, 12), gunEdgeMat);
  barrel.rotation.x = -Math.PI / 2;
  barrel.position.set(x, -0.48, -1.55);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.16, 12), gunEdgeMat);
  muzzle.rotation.x = -Math.PI / 2;
  muzzle.position.set(x, -0.48, -2.02);

  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 10), flashMat.clone());
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(x, -0.48, -2.22);
  flash.visible = false;
  muzzleFlashes.push(flash);

  const ammoCan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.34), gunMat);
  ammoCan.position.set(x + Math.sign(x) * 0.18, -0.58, -0.08);
  for (let i = 0; i < 5; i++) {
    const round = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.055), beltMat);
    round.position.set(x + Math.sign(x) * (0.09 + i * 0.028), -0.48, -0.19 - i * 0.035);
    round.rotation.y = 0.25 * Math.sign(x);
    g.add(round);
  }

  g.add(receiver, cover, jacket, barrel, muzzle, flash, ammoCan);
  return g;
}

function makeTwinFifty() {
  const g = new THREE.Group();
  const flashes = [];
  g.add(makeGunBarrel(-0.18, flashes), makeGunBarrel(0.18, flashes));

  const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.17, 0.42), gunMat);
  cradle.position.set(0, -0.64, -0.12);
  const pintle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.38, 16), gunEdgeMat);
  pintle.position.set(0, -0.78, -0.08);
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.017, 8, 24), gunEdgeMat);
  yoke.rotation.x = Math.PI / 2;
  yoke.position.set(0, -0.57, -0.35);
  g.add(cradle, pintle, yoke);

  const sight = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3df, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false }),
  );
  glass.position.set(0, -0.17, -1.68);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.009, 8, 36), ringMat);
  ringM.position.set(0, -0.17, -1.69);
  const innerM = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.004, 6, 24), ringMat);
  innerM.position.set(0, -0.17, -1.69);
  const beadM = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 8), ringMat);
  beadM.position.set(0, -0.17, -1.7);
  const vPost = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.23, 0.006), ringMat);
  vPost.position.set(0, -0.305, -1.69);
  const hPost = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.006, 0.006), ringMat);
  hPost.position.set(0, -0.17, -1.69);
  sight.add(glass, ringM, innerM, beadM, vPost, hPost);
  g.add(sight);
  g.userData.muzzleFlashes = flashes;
  return g;
}

const gun = makeTwinFifty();
camera.add(gun);

// --- Formation + fighter pool -------------------------------------------------
for (const p of [[-130, -35, -230], [165, 5, -380], [-320, 30, -640]]) {
  const b = makeBomber(); b.position.set(...p); b.rotation.y = Math.PI; b.scale.setScalar(1.5); eng.scene.add(b);
}
const fighters = [];
for (let i = 0; i < 7; i++) { const f = makeFighter(); f.visible = false; f.userData.alive = false; f.scale.setScalar(4.8); eng.scene.add(f); fighters.push(f); }
function liveCount() { return fighters.filter((f) => f.userData.alive).length; }

const _v = new THREE.Vector3();
function spawnFromArc(arc) {
  const f = fighters.find((x) => !x.userData.alive); if (!f) return;
  const d = new THREE.Vector3(...(ARC_DIR[arc] || [0, 0, -1])).normalize();
  const tan = new THREE.Vector3(-d.z, 0, d.x);
  // Start a moderate distance out along the arc, with a lateral offset so the
  // run curves in close (not a far-away crawl, not a fast ram).
  f.position.copy(d).multiplyScalar(220 + Math.random() * 95)
    .addScaledVector(tan, (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 70))
    .add(new THREE.Vector3(0, (Math.random() - 0.5) * 80, 0));
  f.userData.alive = true; f.visible = true;
  f.userData.arc = arc;
  f.userData.phase = 'approach';
  f.userData.speed = 62 + Math.random() * 18;          // trackable closing speed
  f.userData.vel = _v.copy(d).multiplyScalar(-f.userData.speed);
  f.userData.fired = false;
  f.userData.roll = 0;
  f.userData.hp = 1;
  // Aim close past the bomber so it bores right in, fires, then breaks away.
  f.userData.aim = new THREE.Vector3((Math.random() - 0.5) * 28, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 28);
  radioBandit(state, arc);
}

const bursts = [];
function burst(p, col = 0xffb13c, size = 7) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true }));
  m.position.copy(p); m.userData.life = 0.5; eng.scene.add(m); bursts.push(m);
}

const flakBursts = [];
const flakSmokeTex = makeFlakTexture();
const flakSmokeBase = new THREE.SpriteMaterial({ map: flakSmokeTex, color: 0x171817, transparent: true, opacity: 0.92, depthWrite: false });
const flakFlashBase = new THREE.SpriteMaterial({ map: flakSmokeTex, color: 0xffc56a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
const flakSparkMat = new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0.9, depthWrite: false });

function makeFlakTexture() {
  const N = 128, r = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const img = x.createImageData(N, N);
  const d = img.data;
  for (let yy = 0; yy < N; yy++) {
    for (let xx = 0; xx < N; xx++) {
      const dx = (xx - r) / r, dy = (yy - r) / r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const lobe = Math.sin(xx * 0.23) * Math.sin(yy * 0.19) * 0.18 + Math.sin((xx + yy) * 0.11) * 0.12;
      const edge = Math.max(0, 1 - dist);
      const alpha = Math.max(0, Math.min(1, edge * edge * (1.15 + lobe)));
      const i = (yy * N + xx) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(alpha * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function spawnFlakBurst(close = false) {
  if (state.phase !== 'cruise') return;
  const local = new THREE.Vector3(
    (Math.random() - 0.5) * (close ? 210 : 660),
    -35 + Math.random() * (close ? 175 : 260),
    -(close ? 135 + Math.random() * 220 : 260 + Math.random() * 680),
  );
  if (!close && Math.random() < 0.32) local.x += (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 180);

  const g = new THREE.Group();
  g.position.copy(camera.localToWorld(local));
  g.userData.life = close ? 1.45 : 1.25;
  g.userData.max = g.userData.life;
  g.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 10, 12 + Math.random() * 20);

  const flash = new THREE.Sprite(flakFlashBase.clone());
  flash.scale.setScalar(close ? 46 : 28);
  flash.userData = { kind: 'flash', base: flash.scale.x };
  g.add(flash);

  const puffs = close ? 9 : 6;
  for (let i = 0; i < puffs; i++) {
    const s = new THREE.Sprite(flakSmokeBase.clone());
    const a = Math.random() * Math.PI * 2;
    const rr = (0.25 + Math.random() * 0.95) * (close ? 18 : 13);
    s.position.set(Math.cos(a) * rr, (Math.random() - 0.35) * rr, Math.sin(a) * rr * 0.45);
    const sc = (close ? 32 : 24) * (0.7 + Math.random() * 0.75);
    s.scale.set(sc, sc, 1);
    s.material.opacity = close ? 0.88 : 0.74;
    s.userData = { kind: 'smoke', base: sc, alpha: s.material.opacity };
    g.add(s);
  }

  const sparks = close ? 14 : 7;
  for (let i = 0; i < sparks; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(close ? 1.4 : 1.0, 6, 4), flakSparkMat.clone());
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize();
    m.position.copy(dir).multiplyScalar(5 + Math.random() * 18);
    m.userData = { kind: 'spark', dir, speed: 26 + Math.random() * 42 };
    g.add(m);
  }

  eng.scene.add(g);
  flakBursts.push(g);
  state.flakFlash = Math.max(state.flakFlash || 0, close ? 0.65 : 0.28);
}

function spawnFlakSalvo(count, close = false) {
  for (let i = 0; i < count; i++) setTimeout(() => spawnFlakBurst(close && i === 0), i * (90 + Math.random() * 80));
}

// --- Bomb-run city ------------------------------------------------------------
let city = null, factory = null;
function makeCity() {
  const g = new THREE.Group();
  const tex = cityTexture();
  tex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; g.add(ground);

  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x242721, roughness: 0.96 }),
    roadLine: new THREE.MeshBasicMaterial({ color: 0xb6b4a2, transparent: true, opacity: 0.55, depthWrite: false }),
    rail: new THREE.MeshStandardMaterial({ color: 0x171817, roughness: 0.82, metalness: 0.15 }),
    sleeper: new THREE.MeshStandardMaterial({ color: 0x3a3025, roughness: 1 }),
    water: new THREE.MeshBasicMaterial({ color: 0x496f91, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    park: new THREE.MeshStandardMaterial({ color: 0x455b31, roughness: 1 }),
    roofs: [
      new THREE.MeshStandardMaterial({ color: 0x4d544b, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x62685e, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x747568, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x3f4742, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x6e5d4d, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x555f68, roughness: 1 }),
    ],
    walls: [
      new THREE.MeshStandardMaterial({ color: 0x797d70, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x676d62, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x8c846f, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x5a6158, roughness: 1 }),
    ],
    factoryWall: new THREE.MeshStandardMaterial({ color: 0xa99f83, roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x806b54, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x30352f, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb1a7, roughness: 0.55, metalness: 0.05 }),
    yard: new THREE.MeshStandardMaterial({ color: 0x34382f, roughness: 1 }),
  };

  addCityRiver(g, mats);
  addRoadGrid(g, mats);
  addDenseBlocks(g, mats);
  addRailYard(g, mats);
  addParks(g, mats);

  factory = buildFactory(mats);
  factory.position.set(0, 0, 0);
  g.add(factory);
  g.position.set(0, -960, -1380);
  return g;
}

function addRoadGrid(g, mats) {
  for (let x = -1320; x <= 1320; x += 360) addRoad(g, x, 0, x === 0 ? 34 : 22, 3100, mats.road, true);
  for (let z = -1440; z <= 1440; z += 330) addRoad(g, 0, z, 3300, z === 0 ? 34 : 22, mats.road, false);
  for (const z of [-165, 165, 330]) addRoad(g, 0, z, 950, 16, mats.road, false);
  for (const x of [-260, 260]) addRoad(g, x, 70, 16, 760, mats.road, true);
}

function addRoad(g, x, z, w, d, mat, vertical) {
  const road = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), mat);
  road.position.set(x, 1.2, z);
  g.add(road);
  const lineCount = vertical ? Math.floor(d / 130) : Math.floor(w / 130);
  for (let i = -lineCount; i <= lineCount; i++) {
    if (i % 2) continue;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(vertical ? Math.max(2, w * 0.08) : 44, 0.5, vertical ? 44 : Math.max(2, d * 0.08)), cityLineMaterial());
    mark.position.set(x + (vertical ? 0 : i * 65), 2.1, z + (vertical ? i * 65 : 0));
    g.add(mark);
  }
}

function cityLineMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0xb6b4a2, transparent: true, opacity: 0.42, depthWrite: false });
}

function addDenseBlocks(g, mats) {
  const sx = 92, sz = 108;
  for (let gx = -15; gx <= 15; gx++) {
    for (let gz = -15; gz <= 15; gz++) {
      if (gx % 4 === 0 || gz % 3 === 0) continue;
      if (Math.abs(gx) <= 2 && gz >= -2 && gz <= 2) continue;
      if (seeded(gx * 41 + gz * 73) < 0.08) continue;
      const lots = seeded(gx * 17 - gz * 29) > 0.72 ? 2 : 1;
      for (let n = 0; n < lots; n++) {
        const key = gx * 300 + gz * 17 + n * 47;
        const px = gx * sx + (seeded(key + 1) - 0.5) * 28 + (lots === 2 ? (n ? 18 : -18) : 0);
        const pz = gz * sz + (seeded(key + 2) - 0.5) * 32;
        const bw = (34 + seeded(key + 3) * 42) * (lots === 2 ? 0.74 : 1);
        const bd = (30 + seeded(key + 4) * 54) * (lots === 2 ? 0.78 : 1);
        const bh = 7 + Math.pow(seeded(key + 5), 1.6) * 58;
        const wall = mats.walls[Math.floor(seeded(key + 6) * mats.walls.length) % mats.walls.length];
        const roof = mats.roofs[Math.floor(seeded(key + 7) * mats.roofs.length) % mats.roofs.length];
        addBuilding(g, px, pz, bw, bd, bh, wall, roof, key);
      }
    }
  }
}

function addBuilding(g, x, z, w, d, h, wall, roof, key) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
  body.position.set(x, h / 2 + 1.2, z);
  if (seeded(key + 8) > 0.62) body.rotation.y = (seeded(key + 9) - 0.5) * 0.18;
  g.add(body);

  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 2.2, d * 1.04), roof);
  top.position.set(x, h + 2.5, z);
  top.rotation.y = body.rotation.y;
  g.add(top);

  const ventCount = h > 19 ? 1 + Math.floor(seeded(key + 10) * 3) : 0;
  for (let i = 0; i < ventCount; i++) {
    const vx = x + (seeded(key + 20 + i) - 0.5) * w * 0.55;
    const vz = z + (seeded(key + 30 + i) - 0.5) * d * 0.55;
    const vent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.12, 2.4, d * 0.09), roof);
    vent.position.set(vx, h + 5, vz);
    vent.rotation.y = body.rotation.y + seeded(key + 40 + i) * Math.PI;
    g.add(vent);
  }
}

function addCityRiver(g, mats) {
  addCityRibbon(g, [
    [780, -1900], [690, -1360], [840, -900], [640, -470], [720, -80],
    [540, 330], [660, 780], [490, 1210], [560, 1900],
  ], 185, mats.water, 1.4);
  for (const [x, z, rot, len] of [[705, -520, -0.25, 250], [595, 290, 0.25, 230], [545, 1120, -0.18, 250]]) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(len, 5, 42), new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.9 }));
    bridge.position.set(x, 4.2, z);
    bridge.rotation.y = rot;
    g.add(bridge);
    for (const off of [-16, 16]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 3), mats.rail);
      rail.position.set(x, 7, z + off);
      rail.rotation.y = rot;
      g.add(rail);
    }
  }
}

function addCityRibbon(g, points, width, mat, y) {
  const pts = points.map(([x, z]) => new THREE.Vector2(x, z));
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width * 0.5);
    left.push(pts[i].clone().add(normal));
    right.push(pts[i].clone().sub(normal));
  }
  const shape = new THREE.Shape();
  shape.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) shape.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  g.add(mesh);
}

function addRailYard(g, mats) {
  const yard = new THREE.Mesh(new THREE.BoxGeometry(780, 1.2, 340), mats.yard);
  yard.position.set(-445, 1.1, -260);
  g.add(yard);
  for (let i = 0; i < 7; i++) {
    const z = -390 + i * 46;
    for (const off of [-8, 8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(760, 1.4, 4), mats.rail);
      rail.position.set(-445, 2.4, z + off);
      g.add(rail);
    }
    for (let s = -360; s <= 360; s += 54) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 5), mats.sleeper);
      sleeper.position.set(-445 + s, 2.2, z);
      g.add(sleeper);
    }
  }
  const carMat = new THREE.MeshStandardMaterial({ color: 0x5b3d32, roughness: 0.85 });
  for (let i = 0; i < 13; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(54, 15, 22), carMat);
    car.position.set(-760 + i * 52, 10, -345 + (i % 4) * 46);
    g.add(car);
  }
  addBuilding(g, -850, -120, 130, 78, 28, mats.brick, mats.dark, 3200);
  addBuilding(g, -650, -110, 110, 62, 22, mats.walls[1], mats.dark, 3201);
}

function addParks(g, mats) {
  for (const [x, z, w, d] of [[-990, 650, 210, 160], [1010, -720, 240, 130], [1030, 530, 170, 190]]) {
    const park = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), mats.park);
    park.position.set(x, 1.3, z);
    g.add(park);
    for (let i = 0; i < 16; i++) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(8 + seeded(x + z + i) * 8, 18 + seeded(i * 19) * 14, 7), new THREE.MeshStandardMaterial({ color: 0x263f25, roughness: 1 }));
      tree.position.set(x + (seeded(i * 71 + x) - 0.5) * w * 0.8, 13, z + (seeded(i * 89 + z) - 0.5) * d * 0.8);
      g.add(tree);
    }
  }
}

function buildFactory(mats) {
  const f = new THREE.Group();

  const yard = new THREE.Mesh(new THREE.BoxGeometry(440, 1, 250), mats.yard);
  yard.position.set(0, 0.6, 0);
  f.add(yard);

  const hall = new THREE.Mesh(new THREE.BoxGeometry(260, 34, 88), mats.factoryWall);
  hall.position.y = 17;
  f.add(hall);
  const annex = new THREE.Mesh(new THREE.BoxGeometry(92, 22, 64), mats.brick);
  annex.position.set(158, 11, 14);
  f.add(annex);
  const office = new THREE.Mesh(new THREE.BoxGeometry(70, 18, 48), mats.walls[2]);
  office.position.set(-170, 9, 42);
  f.add(office);

  for (let i = 0; i < 8; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(24, 11, 88), mats.dark);
    t.position.set(-112 + i * 32, 38, 0); t.rotation.z = 0.22; f.add(t);
    const skylight = new THREE.Mesh(new THREE.BoxGeometry(14, 1.5, 78), mats.glass);
    skylight.position.set(-102 + i * 32, 43, -2); skylight.rotation.z = 0.22; f.add(skylight);
  }
  for (const x of [-88, 88]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 92, 14), mats.dark);
    c.position.set(x, 43, -54);
    f.add(c);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: 0x202226, transparent: true, opacity: 0.32, depthWrite: false }));
    smoke.position.set(x + 8, 94, -58);
    smoke.scale.set(1.35, 0.6, 1.0);
    f.add(smoke);
  }
  for (const x of [-125, 125]) {
    const loading = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 16), mats.dark);
    loading.position.set(x, 8, 58);
    f.add(loading);
  }
  for (const x of [-28, 0, 28]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 260), mats.rail);
    rail.position.set(x, 1.7, -122);
    f.add(rail);
  }
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 16), mats.brick);
    crate.position.set(-180 + i * 28, 5, 85);
    f.add(crate);
  }
  const crane = new THREE.Group();
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x484438, roughness: 0.8 });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(8, 50, 8), craneMat);
  mast.position.set(190, 25, -55);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(110, 6, 6), craneMat);
  arm.position.set(150, 50, -55);
  crane.add(mast, arm);
  f.add(crane);
  return f;
}
function cityTexture() {
  const N = 1024; const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  const pal = ['#657740', '#829050', '#9a9761', '#596c38', '#777047', '#8b9a59'];
  x.fillStyle = '#6a783f'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 150; i++) {
    x.fillStyle = pal[i % pal.length];
    const w = 24 + seeded(i * 11) * 82, h = 24 + seeded(i * 13) * 76;
    x.fillRect(seeded(i * 17) * N, seeded(i * 19) * N, w, h);
  }
  x.fillStyle = '#60675c'; x.fillRect(N * 0.12, N * 0.12, N * 0.76, N * 0.76);
  x.strokeStyle = '#242720'; x.lineWidth = 6;
  for (let i = 0; i <= 9; i++) { const p = N * 0.14 + (N * 0.72) * i / 9; x.beginPath(); x.moveTo(p, N * 0.13); x.lineTo(p, N * 0.87); x.stroke(); }
  for (let i = 0; i <= 10; i++) { const p = N * 0.13 + (N * 0.74) * i / 10; x.beginPath(); x.moveTo(N * 0.13, p); x.lineTo(N * 0.87, p); x.stroke(); }
  x.strokeStyle = 'rgba(235,232,190,0.28)'; x.lineWidth = 1.5;
  for (let i = 0; i <= 9; i++) { const p = N * 0.14 + (N * 0.72) * i / 9; x.beginPath(); x.moveTo(p + 3, N * 0.13); x.lineTo(p + 3, N * 0.87); x.stroke(); }
  const roofPal = ['#777d70', '#4d554b', '#686b60', '#8a816a', '#46525a', '#5b624f'];
  for (let i = 0; i < 420; i++) {
    const px = N * 0.145 + seeded(i * 23) * N * 0.7;
    const py = N * 0.145 + seeded(i * 29) * N * 0.7;
    if (px > N * 0.42 && px < N * 0.6 && py > N * 0.46 && py < N * 0.58) continue;
    x.fillStyle = roofPal[i % roofPal.length];
    x.fillRect(px, py, 7 + seeded(i * 31) * 24, 8 + seeded(i * 37) * 26);
  }
  x.strokeStyle = '#4d6f93'; x.lineWidth = 26; x.lineCap = 'round'; x.beginPath();
  for (let y = 0; y <= N; y += 16) { const xx = N * 0.64 + Math.sin(y * 0.024) * N * 0.075 + Math.sin(y * 0.008) * N * 0.045; y === 0 ? x.moveTo(xx, y) : x.lineTo(xx, y); }
  x.stroke();
  x.fillStyle = '#34382f'; x.fillRect(N * 0.40, N * 0.47, N * 0.23, N * 0.13);
  x.fillStyle = '#a99f83'; x.fillRect(N * 0.43, N * 0.505, N * 0.18, N * 0.044);
  x.fillStyle = '#34382f';
  for (let i = 0; i < 8; i++) x.fillRect(N * 0.438 + i * N * 0.022, N * 0.488, N * 0.014, N * 0.019);
  x.strokeStyle = '#1d1d19'; x.lineWidth = 2;
  for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(N * 0.28, N * (0.38 + i * 0.025)); x.lineTo(N * 0.47, N * (0.38 + i * 0.025)); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function seeded(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// --- Station switching --------------------------------------------------------
function switchTo(id) {
  const s = STATIONS[id]; if (!s || state.phase !== 'cruise') return;
  state.mode = id;
  state.base = { yaw: s.yaw, pitch: s.pitch, yawCone: s.yawCone || 0.7, pitchCone: s.pitchCone || 0.6, fullYaw: !!s.fullYaw };
  state.lookYaw = 0; state.lookPitch = 0; state.lookDX = 0; state.lookDY = 0;
  if (s.pilot) { state.headX = 0; state.headY = 0; state.headZoom = 0; }
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
const KEY_STATIONS = { Digit1: 'pilot', Digit2: 'nose', Digit3: 'top', Digit4: 'ball', Digit5: 'tail', Digit6: 'waistL', Digit7: 'waistR' };
function diagramHit(x, y) {
  for (const h of diagramHotspots) { if (Math.hypot(x - h.sx, y - h.sy) <= h.r) return h.id; }
  return null;
}

// --- Input --------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
let dragging = false, lastX = 0, lastY = 0, moved = 0, pid = null, onThrottle = false, onDiagram = false, onHeadPad = false;
const SENS = 0.0035;
function inThrottle(x, y) { const r = throttleRectScreen(W, H); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function inHeadPad(x, y) { const r = headPadRectScreen(W, H); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
overlay.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'cruise') return;
  dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0;
  onDiagram = !!diagramHit(e.clientX, e.clientY);
  onThrottle = state.mode === 'pilot' && inThrottle(e.clientX, e.clientY);
  onHeadPad = state.mode === 'pilot' && !onThrottle && inHeadPad(e.clientX, e.clientY);
  if (state.mode !== 'pilot' && !onDiagram) beginTrigger();
  overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  if (onDiagram) return;
  if (state.mode === 'pilot') {
    if (onThrottle) { state.throttle = clamp(state.throttle - dy * 0.004, 0.7, 1.4); return; }
    if (onHeadPad) {
      state.headX = clamp(state.headX + dx * 0.012, -1, 1);
      state.headY = clamp(state.headY - dy * 0.012, -1, 1);
      return;
    }
    // Look around the cockpit only. The outside view stays mostly straight
    // ahead, so this feels like head movement rather than steering the plane.
    state.lookYaw = clamp(state.lookYaw - dx * SENS, -state.base.yawCone, state.base.yawCone);
    state.lookPitch = clamp(state.lookPitch - dy * SENS, -state.base.pitchCone, state.base.pitchCone);
  } else {
    state.lookYaw = state.base.fullYaw ? wrapAngle(state.lookYaw - dx * SENS) : clamp(state.lookYaw - dx * SENS, -state.base.yawCone, state.base.yawCone);
    state.lookPitch = clamp(state.lookPitch - dy * SENS, -state.base.pitchCone, state.base.pitchCone);
  }
});
overlay.addEventListener('pointerup', (e) => {
  if (e.pointerId === pid && moved < 9 && state.phase === 'cruise') {
    const id = diagramHit(e.clientX, e.clientY);
    if (id) switchTo(id);
    else if (onHeadPad) { state.headX = 0; state.headY = 0; state.headZoom = 0; }
  }
  endTrigger();
  dragging = false; pid = null; onDiagram = false; onHeadPad = false;
});
overlay.addEventListener('pointercancel', () => { endTrigger(); dragging = false; pid = null; onDiagram = false; onHeadPad = false; });
overlay.addEventListener('wheel', (e) => {
  if (state.phase !== 'cruise' || state.mode !== 'pilot') return;
  e.preventDefault();
  state.headZoom = clamp(state.headZoom - e.deltaY * 0.0015, -1, 1);
}, { passive: false });
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function wrapAngle(v) { return ((v + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

addEventListener('keydown', (e) => {
  if (state.phase === 'cruise' && KEY_STATIONS[e.code]) {
    e.preventDefault();
    switchTo(KEY_STATIONS[e.code]);
    return;
  }
  if (state.phase === 'cruise' && state.mode === 'pilot') {
    const step = e.shiftKey ? 0.18 : 0.09;
    if (e.code === 'ArrowLeft') { e.preventDefault(); state.headX = clamp(state.headX - step, -1, 1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); state.headX = clamp(state.headX + step, -1, 1); }
    if (e.code === 'ArrowUp') { e.preventDefault(); state.headY = clamp(state.headY + step, -1, 1); }
    if (e.code === 'ArrowDown') { e.preventDefault(); state.headY = clamp(state.headY - step, -1, 1); }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); state.headZoom = clamp(state.headZoom + step, -1, 1); }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); state.headZoom = clamp(state.headZoom - step, -1, 1); }
    if (e.code === 'KeyC') { state.headX = 0; state.headY = 0; state.headZoom = 0; state.lookYaw = 0; state.lookPitch = 0; }
  }
  if (e.code === 'Space' && state.phase === 'cruise' && state.mode !== 'pilot') {
    e.preventDefault();
    beginTrigger();
  }
});
addEventListener('keyup', (e) => { if (e.code === 'Space') endTrigger(); });

function beginTrigger() {
  const g = state.gun;
  if (!g || state.phase !== 'cruise' || state.mode === 'pilot') return;
  g.trigger = true;
  if (g.fireCooldown <= 0) {
    fire();
    g.fireCooldown = 1 / GUNPLAY.rate;
  }
}
function endTrigger() { if (state.gun) state.gun.trigger = false; }

function fire() {
  const g = state.gun;
  if (!g || state.phase !== 'cruise' || state.mode === 'pilot') return false;
  if (g.ammo < GUNPLAY.roundsPerCycle) { g.emptyClick = 0.18; g.trigger = false; return false; }

  g.ammo -= GUNPLAY.roundsPerCycle;
  g.recoil = Math.min(1, g.recoil + GUNPLAY.recoilKick);
  g.spread = GUNPLAY.spreadBase + g.recoil * GUNPLAY.spreadRecoil;
  state.fireFx = 0.08;

  let anyHit = false;
  for (const off of [-1, 1]) anyHit = fireOneRound(off, g.spread) || anyHit;
  return anyHit;
}

function fireOneRound(side, spread) {
  const jitterX = side * 0.0025 + (Math.random() * 2 - 1) * spread;
  const jitterY = -state.gun.recoil * 0.003 + (Math.random() * 2 - 1) * spread;
  raycaster.setFromCamera({ x: jitterX, y: jitterY }, camera);
  const hits = raycaster.intersectObjects(fighters, true);

  const sx = W / 2 + jitterX * W * 0.46;
  const sy = H * 0.54 - jitterY * H * 0.28;
  const bx = W / 2 + side * W * 0.055;
  const by = H * 0.94;
  state.gun.tracers.push({ x1: bx, y1: by, x2: sx, y2: sy, life: 0.13, max: 0.13, hot: Math.random() });
  if (state.gun.tracers.length > 18) state.gun.tracers.shift();

  let target = null;
  for (const h of hits) {
    let o = h.object;
    while (o && fighters.indexOf(o) === -1) o = o.parent;
    if (o && o.userData.alive) { target = o; break; }
  }
  if (!target) return false;

  target.userData.hp = Math.max(0, (target.userData.hp ?? 1) - GUNPLAY.damage);
  state.gun.hitMarker = 0.16;
  target.getWorldPosition(_v);
  const p = _v.clone().project(camera);
  if (Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1) {
    state.gun.sparks.push({ x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, life: 0.22, max: 0.22 });
    if (state.gun.sparks.length > 10) state.gun.sparks.shift();
  }

  if (target.userData.hp <= 0) {
    target.userData.alive = false;
    target.visible = false;
    burst(target.position, 0xffb13c, 8);
    state.kills++;
    radioKill(state);
  } else if (Math.random() < 0.35) {
    burst(target.position, 0xffd36c, 2.4);
  }
  return true;
}

// --- Phases -------------------------------------------------------------------
function showBriefing() {
  state.phase = 'briefing';
  camera.fov = 68; camera.updateProjectionMatrix();
  dropBtn.style.display = 'none';
  screenEl.style.display = 'flex';
  screenEl.innerHTML = `<h1>MISSION BRIEFING</h1><h2>${mission.name}</h2>
    <p>Target: <b>${mission.target.name}</b> — ${mission.target.description} Study the recon photo: in the bomb run you must pick it out yourself.</p>
    <canvas id="recon" width="440" height="240" style="max-width:78vw;border:1px solid #33424f;border-radius:8px;background:#26341f"></canvas>
    <div class="rows">PILOT: drag to look around, use the HEAD pad to lean, drag the throttle to fly &nbsp;·&nbsp; GUNS: tap a station, drag to aim, hold to fire</div>
    <button class="scrn-btn" id="takeoff">TAKE OFF</button>`;
  drawRecon(screenEl.querySelector('#recon'));
  screenEl.querySelector('#takeoff').addEventListener('click', takeOff);
}
function drawRecon(cv) {
  if (!cv) return; const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.fillStyle = '#394a2e'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) {
    x.fillStyle = ['#43542f', '#506235', '#677541', '#6d6644'][i % 4];
    x.fillRect(seeded(i * 17) * W, seeded(i * 23) * H, 18 + seeded(i * 29) * 42, 12 + seeded(i * 31) * 32);
  }
  x.fillStyle = '#646a60'; x.fillRect(W * 0.1, H * 0.1, W * 0.78, H * 0.78);
  x.strokeStyle = '#292b25'; x.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { const p = W * 0.12 + W * 0.73 * i / 8; x.beginPath(); x.moveTo(p, H * 0.11); x.lineTo(p, H * 0.88); x.stroke(); }
  for (let i = 0; i <= 7; i++) { const p = H * 0.13 + H * 0.72 * i / 7; x.beginPath(); x.moveTo(W * 0.11, p); x.lineTo(W * 0.87, p); x.stroke(); }
  for (let i = 0; i < 170; i++) {
    const px = W * 0.13 + seeded(i * 37) * W * 0.7;
    const py = H * 0.14 + seeded(i * 41) * H * 0.68;
    if (px > W * 0.38 && px < W * 0.66 && py > H * 0.44 && py < H * 0.66) continue;
    x.fillStyle = ['#767b70', '#535b51', '#7f755f', '#49575d'][i % 4];
    x.fillRect(px, py, 5 + seeded(i * 43) * 12, 5 + seeded(i * 47) * 11);
  }
  x.strokeStyle = '#4d6f93'; x.lineWidth = 10; x.lineCap = 'round'; x.beginPath();
  for (let y = 0; y <= H; y += 10) { const xx = W * 0.68 + Math.sin(y * 0.045) * W * 0.06 + Math.sin(y * 0.015) * W * 0.03; y === 0 ? x.moveTo(xx, y) : x.lineTo(xx, y); }
  x.stroke();
  x.strokeStyle = '#1f201d'; x.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(W * 0.23, H * (0.36 + i * 0.035)); x.lineTo(W * 0.48, H * (0.36 + i * 0.035)); x.stroke(); }
  // THE FACTORY (matches the 3D target): long hall, sawtooth roof, 2 chimneys
  const fx = W * 0.36, fy = H * 0.5, fw = W * 0.3, fh = H * 0.12;
  x.fillStyle = '#34382f'; x.fillRect(fx - fw * 0.08, fy - fh * 0.2, fw * 1.16, fh * 1.85);
  x.fillStyle = '#b9b09a'; x.fillRect(fx, fy, fw, fh);
  x.fillStyle = '#7a715a'; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(fx + i * fw / 8, fy); x.lineTo(fx + i * fw / 8 + fw / 16, fy - fh * 0.55); x.lineTo(fx + (i + 1) * fw / 8, fy); x.fill(); }
  x.fillStyle = '#3a3a32'; x.beginPath(); x.arc(fx + fw * 0.2, fy + fh * 1.2, 5, 0, 7); x.arc(fx + fw * 0.8, fy + fh * 1.2, 5, 0, 7); x.fill();
  // callout
  x.strokeStyle = '#e6b84d'; x.lineWidth = 2; x.strokeRect(fx - 6, fy - fh * 0.6, fw + 12, fh * 1.9);
  x.fillStyle = '#e6b84d'; x.font = 'bold 14px "Courier New", monospace'; x.textAlign = 'center';
  x.fillText('BALL-BEARING WORKS', W / 2, H * 0.93);
}
function takeOff() {
  Object.assign(state, { phase: 'cruise', throttle: 1, fuel: 100, health: 100, score: 0, kills: 0, position: 0, hitFlash: 0, bomb: null, result: null, climb: 1 });
  state.gun = makeGunState();
  state._waves = new Set(); state._warned = {}; state._flakT = 0; state._flakVisualT = 0; state.flakFlash = 0;
  for (const f of fighters) { f.userData.alive = false; f.visible = false; }
  for (const b of flakBursts.splice(0)) eng.scene.remove(b);
  if (city) { eng.scene.remove(city); city = null; factory = null; }
  camera.fov = 68; camera.updateProjectionMatrix();
  screenEl.style.display = 'none';
  switchTo('pilot');
  pushRadio(state, 'Wheels up — climbing out. Watch your throttle.', 'info');
}
function enterBombRun() {
  state.phase = 'bombrun'; state.mode = 'bombrun';
  gun.visible = false;
  for (const f of fighters) { f.userData.alive = false; f.visible = false; }
  camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');     // look straight down
  camera.fov = 76; camera.updateProjectionMatrix();
  city = makeCity(); eng.scene.add(city);
  state.bomb = { dropped: false, result: null, speed: 76, t: 0 };
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
    const pilot = state.mode === 'pilot';
    camera.rotation.y = state.base.yaw + (pilot ? 0 : state.lookYaw);
    camera.rotation.x = state.base.pitch + (pilot ? 0 : state.lookPitch) + (pilot ? state.climb * 0.16 : 0);
    state.lookDX = state.lookYaw; state.lookDY = state.lookPitch;
  }
  updateGun(dt);
  state.heading = Math.round(((-camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
  state.speed = Math.round(state.throttle * 180);
  if (state.hitFlash > 0) state.hitFlash = Math.max(0, state.hitFlash - dt * 1.6);
  if (state.flakFlash > 0) state.flakFlash = Math.max(0, state.flakFlash - dt * 1.8);

  if (state.phase === 'cruise') updateCruise(dt);
  else if (state.phase === 'bombrun') updateBombRun(dt);

  if (state.fireFx > 0) state.fireFx = Math.max(0, state.fireFx - dt);
  const flashOn = state.fireFx > 0 && state.mode !== 'pilot';
  for (const m of gun.userData.muzzleFlashes || []) {
    m.visible = flashOn;
    if (flashOn) {
      const s = 0.85 + Math.random() * 0.45;
      m.scale.setScalar(s);
      m.material.opacity = 0.45 + Math.random() * 0.45;
    }
  }
  updateFighters(dt);
  updateFlak(dt);
  for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.userData.life -= dt; b.scale.multiplyScalar(1 + dt * 4); b.material.opacity = Math.max(0, b.userData.life / 0.5); if (b.userData.life <= 0) { eng.scene.remove(b); bursts.splice(i, 1); } }

  eng.render();
  drawOverlay();
  requestAnimationFrame(tick);
}

function updateGun(dt) {
  const g = state.gun;
  if (!g) return;
  if (state.phase !== 'cruise' || state.mode === 'pilot') g.trigger = false;

  g.fireCooldown = Math.max(0, g.fireCooldown - dt);
  g.emptyClick = Math.max(0, g.emptyClick - dt);
  g.hitMarker = Math.max(0, g.hitMarker - dt);
  g.recoil = Math.max(0, g.recoil - dt * GUNPLAY.recoilRecover);
  g.spread = GUNPLAY.spreadBase + g.recoil * GUNPLAY.spreadRecoil;

  for (let i = g.tracers.length - 1; i >= 0; i--) {
    g.tracers[i].life -= dt;
    if (g.tracers[i].life <= 0) g.tracers.splice(i, 1);
  }
  for (let i = g.sparks.length - 1; i >= 0; i--) {
    g.sparks[i].life -= dt;
    if (g.sparks[i].life <= 0) g.sparks.splice(i, 1);
  }

  if (g.trigger && g.ammo >= GUNPLAY.roundsPerCycle && g.fireCooldown <= 0) {
    fire();
    g.fireCooldown = 1 / GUNPLAY.rate;
  }

  const targetColor = g.trigger ? 0xffe08a : 0xff5a4d;
  ringMat.color.setHex(targetColor);
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
      if (dist > 600) { u.alive = false; f.visible = false; continue; }
    }
    // Steer velocity toward desired (limited turn rate) -> curved path.
    const turn = 1 - Math.exp(-dt * 2.2);
    u.vel.lerp(_desired, turn);
    f.position.addScaledVector(u.vel, dt);
    // Orient nose into the direction of travel. Object3D.lookAt aims +Z at the
    // target, and the model's nose is -Z, so look at a point BEHIND the motion.
    _tmp.copy(f.position).sub(u.vel); f.lookAt(_tmp);
    if (u.prop) u.prop.rotation.z += dt * 40;            // spinning propeller
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
    if (!state._warned.flak) { state._warned.flak = true; pushRadio(state, 'Flak ahead — hold her steady!', 'warn'); spawnFlakSalvo(5, false); }
    state._flakVisualT -= dt;
    if (state._flakVisualT <= 0) {
      state._flakVisualT = Math.max(0.28, 0.78 - z.intensity * 0.35) + Math.random() * 0.35;
      spawnFlakBurst(false);
      if (Math.random() < z.intensity * 0.28) spawnFlakBurst(false);
    }
    state._flakT -= dt;
    if (state._flakT <= 0) {
      state._flakT = 1.4 + Math.random() * 1.2;
      if (Math.random() < z.intensity * 0.4) {
        spawnFlakSalvo(3, true);
        damage(4, 'Flak burst — she\'s rattling!');
      }
    }
  }

  if (!state._warned.fuel && state.fuel < 25) { state._warned.fuel = true; pushRadio(state, 'Fuel\'s getting low!', 'warn'); }
  if (state.health <= 0) { enterResults(false); return; }
  if (state.position >= mission.distance) enterBombRun();
}

function damage(n, msg) { state.health = Math.max(0, state.health - n); state.hitFlash = Math.min(1, state.hitFlash + 0.6); if (msg) pushRadio(state, msg, 'alert'); }

function updateFlak(dt) {
  for (let i = flakBursts.length - 1; i >= 0; i--) {
    const g = flakBursts[i];
    g.userData.life -= dt;
    const a = Math.max(0, g.userData.life / g.userData.max);
    g.position.addScaledVector(g.userData.drift, dt);
    for (const child of g.children) {
      const u = child.userData || {};
      if (u.kind === 'flash') {
        child.scale.setScalar(u.base * (0.45 + (1 - a) * 1.8));
        child.material.opacity = Math.max(0, (a - 0.62) * 2.6);
      } else if (u.kind === 'smoke') {
        child.scale.setScalar(u.base * (1 + (1 - a) * 1.9));
        child.material.opacity = u.alpha * Math.min(1, a * 1.7);
      } else if (u.kind === 'spark') {
        child.position.addScaledVector(u.dir, u.speed * dt);
        child.material.opacity = Math.max(0, (a - 0.18) * 1.15);
      }
    }
    if (g.userData.life <= 0) {
      eng.scene.remove(g);
      flakBursts.splice(i, 1);
    }
  }
}

function updateBombRun(dt) {
  const b = state.bomb; if (!b || !city) return;
  if (!b.dropped) {
    city.position.z += b.speed * dt;
    if (factory) { factory.getWorldPosition(_v); if (_v.z > 1320) { b.dropped = true; b.result = { hit: false, accuracy: 0 }; pushRadio(state, 'Target slipped past — no drop!', 'alert'); setTimeout(() => enterResults(true), 1200); } }
  }
}

// --- Overlay drawing ----------------------------------------------------------
function drawOverlay() {
  if (state.phase === 'briefing' || state.phase === 'results') { octx.clearRect(0, 0, W, H); return; }
  if (state.phase === 'bombrun') { drawBombsight(); return; }
  if (state.mode === 'pilot') { if (cockpitReady) drawCockpit(octx, W, H, state); else octx.clearRect(0, 0, W, H); }
  else { drawGunFrame(octx, W, H, state); drawTracers(); drawGunFeedback(); }

  drawPlaneDiagram(octx, W, H, clock);
  drawStatus();
  drawRadio();
  drawFlakFlash();
  if (state.hitFlash > 0) { const g = octx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8); g.addColorStop(0, 'rgba(224,88,74,0)'); g.addColorStop(1, `rgba(224,88,74,${0.5 * state.hitFlash})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H); }
}

// Bright tracer streaks from the two guns converging on the gunsight, plus a
// muzzle glow — drawn in 2D so they're always clearly visible.
function drawTracers() {
  const gstate = state.gun;
  if (!gstate) return;
  octx.save();
  octx.lineCap = 'round';
  for (const t of gstate.tracers) {
    const a = Math.max(0, t.life / t.max);
    octx.strokeStyle = `rgba(255,221,115,${0.82 * a})`;
    octx.lineWidth = Math.max(2, W * 0.0038) * (0.7 + t.hot * 0.35);
    octx.beginPath(); octx.moveTo(t.x1, t.y1); octx.lineTo(t.x2, t.y2); octx.stroke();
    // hot core
    octx.strokeStyle = `rgba(255,255,255,${0.6 * a})`;
    octx.lineWidth = Math.max(1, W * 0.0016);
    octx.beginPath(); octx.moveTo(t.x1, t.y1); octx.lineTo(t.x2, t.y2); octx.stroke();
  }
  if (state.fireFx > 0) {
    const a = Math.min(1, state.fireFx / 0.08);
    for (const off of [-1, 1]) {
      const bx = W / 2 + off * W * 0.055, by = H * 0.94;
      const glow = octx.createRadialGradient(bx, by, 0, bx, by, W * 0.035);
      glow.addColorStop(0, `rgba(255,216,106,${0.85 * a})`);
      glow.addColorStop(1, 'rgba(255,216,106,0)');
      octx.fillStyle = glow;
      octx.beginPath(); octx.arc(bx, by, W * 0.035, 0, Math.PI * 2); octx.fill();
    }
  }
  for (const s of gstate.sparks) {
    const a = Math.max(0, s.life / s.max);
    octx.strokeStyle = `rgba(255,234,160,${a})`;
    octx.lineWidth = Math.max(1.5, W * 0.002);
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2 + a * 1.7;
      const r1 = W * 0.006, r2 = W * 0.018 * (1 - a * 0.25);
      octx.beginPath();
      octx.moveTo(s.x + Math.cos(ang) * r1, s.y + Math.sin(ang) * r1);
      octx.lineTo(s.x + Math.cos(ang) * r2, s.y + Math.sin(ang) * r2);
      octx.stroke();
    }
  }
  octx.restore();
}

function drawGunFeedback() {
  const g = state.gun;
  if (!g) return;
  const cx = W / 2, cy = H * 0.54;
  octx.save();

  if (g.hitMarker > 0) {
    const a = Math.min(1, g.hitMarker / 0.16);
    octx.strokeStyle = `rgba(143,224,160,${a})`;
    octx.lineWidth = Math.max(2, W * 0.0025);
    const r = Math.max(18, Math.min(W, H) * 0.038);
    octx.beginPath();
    octx.moveTo(cx - r, cy - r); octx.lineTo(cx - r * 0.45, cy - r * 0.45);
    octx.moveTo(cx + r, cy - r); octx.lineTo(cx + r * 0.45, cy - r * 0.45);
    octx.moveTo(cx - r, cy + r); octx.lineTo(cx - r * 0.45, cy + r * 0.45);
    octx.moveTo(cx + r, cy + r); octx.lineTo(cx + r * 0.45, cy + r * 0.45);
    octx.stroke();
  }

  const fs = Math.max(11, H * 0.022);
  const bw = Math.min(W - 18, Math.max(230, W * 0.22));
  const bh = fs * 3.45;
  const x = W - bw - Math.max(10, W * 0.012);
  const y = H - bh - Math.max(12, H * 0.018);
  octx.fillStyle = 'rgba(6,10,14,0.66)';
  rr(octx, x, y, bw, bh, 6); octx.fill();
  octx.strokeStyle = 'rgba(160,178,190,0.35)';
  octx.lineWidth = 1;
  rr(octx, x, y, bw, bh, 6); octx.stroke();

  octx.font = `bold ${fs}px "Courier New", monospace`;
  octx.fillStyle = '#dfeaf2';
  octx.textAlign = 'left';
  octx.fillText(g.trigger ? 'FIRING' : 'TWIN .50', x + 8, y + fs * 1.05);
  octx.fillStyle = '#9fb0bd';
  octx.textAlign = 'right';
  octx.fillText(`${g.ammo} RDS`, x + bw - 8, y + fs * 1.05);

  gunBar(x + 8, y + fs * 1.7, bw - 16, fs * 0.75, Math.min(1, g.spread / 0.02), '#7fb0e0', 'SPREAD');

  if (g.emptyClick > 0 && g.ammo <= 0) {
    octx.fillStyle = '#e6b84d';
    octx.textAlign = 'center';
    octx.fillText('AMMO OUT', x + bw / 2, y - fs * 0.45);
  }
  octx.restore();
}

function gunBar(x, y, w, h, f, col, label) {
  const v = Math.max(0, Math.min(1, f));
  octx.fillStyle = 'rgba(0,0,0,0.48)';
  rr(octx, x, y, w, h, 3); octx.fill();
  octx.fillStyle = col;
  rr(octx, x, y, w * v, h, 3); octx.fill();
  octx.fillStyle = 'rgba(234,242,248,0.9)';
  octx.font = `bold ${h * 0.8}px "Courier New", monospace`;
  octx.textAlign = 'left';
  octx.fillText(label, x + 4, y + h * 0.78);
}

function drawBombsight() {
  octx.clearRect(0, 0, W, H);
  drawBombMapArt();
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) * 0.13;

  const shade = octx.createRadialGradient(cx, cy, r * 0.7, cx, cy, Math.max(W, H) * 0.7);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.62, 'rgba(0,0,0,0.1)');
  shade.addColorStop(1, 'rgba(0,0,0,0.38)');
  octx.fillStyle = shade;
  octx.fillRect(0, 0, W, H);

  octx.save();
  octx.strokeStyle = 'rgba(235,242,244,0.94)';
  octx.fillStyle = 'rgba(235,242,244,0.94)';
  octx.lineWidth = Math.max(1.5, Math.min(W, H) * 0.0025);
  octx.beginPath();
  octx.arc(cx, cy, r, 0, Math.PI * 2);
  octx.arc(cx, cy, r * 0.48, 0, Math.PI * 2);
  octx.moveTo(cx - r - 32, cy); octx.lineTo(cx + r + 32, cy);
  octx.moveTo(cx, cy - r - 32); octx.lineTo(cx, cy + r + 32);
  octx.stroke();

  octx.strokeStyle = 'rgba(235,242,244,0.58)';
  octx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const y = cy + i * r * 0.24;
    octx.beginPath();
    octx.moveTo(cx - 10, y); octx.lineTo(cx + 10, y);
    octx.stroke();
    const x = cx + i * r * 0.24;
    octx.beginPath();
    octx.moveTo(x, cy - 10); octx.lineTo(x, cy + 10);
    octx.stroke();
  }
  octx.strokeStyle = 'rgba(230,184,77,0.85)';
  octx.beginPath();
  octx.moveTo(cx - r * 0.18, cy + r * 0.92);
  octx.lineTo(cx, cy + r * 1.14);
  octx.lineTo(cx + r * 0.18, cy + r * 0.92);
  octx.stroke();

  if (factory && state.bomb && !state.bomb.dropped) {
    factory.getWorldPosition(_v);
    _v.project(camera);
    if (Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2 && Math.abs(_v.z) < 1) {
      const tx = (_v.x * 0.5 + 0.5) * W;
      const ty = (-_v.y * 0.5 + 0.5) * H;
      const close = Math.hypot(_v.x, _v.y) < 0.22;
      octx.strokeStyle = close ? 'rgba(95,199,122,0.95)' : 'rgba(230,184,77,0.9)';
      octx.lineWidth = 2;
      const br = Math.max(18, Math.min(W, H) * 0.035);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        octx.beginPath();
        octx.moveTo(tx + sx * br, ty + sy * br * 0.45);
        octx.lineTo(tx + sx * br, ty + sy * br);
        octx.lineTo(tx + sx * br * 0.45, ty + sy * br);
        octx.stroke();
      }
    }
  }

  octx.fillStyle = '#dfeaf2';
  octx.textAlign = 'center';
  octx.font = `bold ${Math.max(13, H * 0.026)}px "Courier New", monospace`;
  const msg = state.bomb && state.bomb.dropped
    ? (state.bomb.result && state.bomb.result.hit ? 'DIRECT HIT' : 'BOMBS AWAY')
    : 'NORDEN SIGHT · BALL-BEARING WORKS';
  octx.fillText(msg, cx, H * 0.095);
  octx.font = `bold ${Math.max(10, H * 0.02)}px "Courier New", monospace`;
  octx.fillStyle = 'rgba(223,234,242,0.62)';
  octx.fillText('BOMB BAY DOORS OPEN', cx, H * 0.13);
  octx.restore();
  octx.textAlign = 'left';
  drawStatus();
}

function drawBombMapArt() {
  if (!factory) return;
  const base = new THREE.Vector3();
  factory.getWorldPosition(base);
  const p0 = projectMapPoint(base, 0, 0);
  const px = projectMapPoint(base, 100, 0);
  const pz = projectMapPoint(base, 0, 100);
  if (![p0.x, p0.y, px.x, px.y, pz.x, pz.y].every(Number.isFinite)) return;
  if (p0.x < -W * 4 || p0.x > W * 5 || p0.y < -H * 4 || p0.y > H * 5) return;
  const map = {
    p0,
    bx: { x: (px.x - p0.x) / 100, y: (px.y - p0.y) / 100 },
    bz: { x: (pz.x - p0.x) / 100, y: (pz.y - p0.y) / 100 },
  };
  const scale = clamp(Math.hypot(px.x - p0.x, px.y - p0.y) / 100, 0.08, 0.55);

  octx.save();
  octx.globalAlpha = 0.92;
  octx.fillStyle = 'rgba(112,128,78,0.42)';
  octx.fillRect(0, 0, W, H);

  for (let i = 0; i < 52; i++) {
    const ox = -1700 + seeded(i * 19) * 3400;
    const oz = -1700 + seeded(i * 23) * 3400;
    const w = 120 + seeded(i * 29) * 260;
    const d = 90 + seeded(i * 31) * 240;
    drawMapRect(map, ox, oz, w, d, ['#78884f', '#8b9660', '#676f42', '#9c8d60'][i % 4], 0.36);
  }

  drawMapPolyline(map, [[780, -1900], [690, -1360], [840, -900], [640, -470], [720, -80], [540, 330], [660, 780], [490, 1210], [560, 1900]], 185 * scale, 'rgba(69,105,139,0.72)');
  for (const z of [-1440, -1110, -780, -450, -120, 210, 540, 870, 1200, 1530]) drawMapLine(map, -1650, z, 1650, z, 24 * scale, 'rgba(35,38,32,0.88)');
  for (const x of [-1440, -1080, -720, -360, 0, 360, 720, 1080, 1440]) drawMapLine(map, x, -1600, x, 1600, 22 * scale, 'rgba(35,38,32,0.86)');
  for (const z of [-165, 165, 330]) drawMapLine(map, -480, z, 480, z, 15 * scale, 'rgba(28,31,27,0.92)');
  for (const [x, z, rot, len] of [[705, -520, -0.25, 250], [595, 290, 0.25, 230], [545, 1120, -0.18, 250]]) drawMapRect(map, x, z, len, 42, '#555047', 0.9, rot);

  for (let gx = -13; gx <= 13; gx++) {
    for (let gz = -13; gz <= 13; gz++) {
      if (gx % 4 === 0 || gz % 3 === 0) continue;
      if (Math.abs(gx) <= 2 && gz >= -2 && gz <= 2) continue;
      const key = gx * 300 + gz * 17;
      if (seeded(key) < 0.1) continue;
      const lots = seeded(key + 1) > 0.72 ? 2 : 1;
      for (let n = 0; n < lots; n++) {
        const k = key + n * 41;
        const ox = gx * 92 + (seeded(k + 3) - 0.5) * 30 + (lots === 2 ? (n ? 18 : -18) : 0);
        const oz = gz * 108 + (seeded(k + 4) - 0.5) * 30;
        const bw = (34 + seeded(k + 5) * 44) * (lots === 2 ? 0.74 : 1);
        const bd = (30 + seeded(k + 6) * 58) * (lots === 2 ? 0.78 : 1);
        const shade = seeded(k + 7);
        const col = ['#6f766b', '#565f55', '#85816e', '#46545c', '#6f5f51'][Math.floor(shade * 5) % 5];
        drawMapRect(map, ox + 6, oz + 8, bw, bd, 'rgba(20,24,22,0.25)', 0.7);
        drawMapRect(map, ox, oz, bw, bd, col, 0.96, (seeded(k + 8) - 0.5) * 0.16);
        if (seeded(k + 9) > 0.62) drawMapRect(map, ox, oz, bw * 0.2, bd * 0.12, '#313731', 0.9, seeded(k + 10) * Math.PI);
      }
    }
  }

  drawRailMap(map, scale);
  drawFactoryMap(map);
  octx.restore();
}

function projectMapPoint(base, ox, oz) {
  const p = new THREE.Vector3(base.x + ox, base.y + 3, base.z + oz).project(camera);
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z };
}

function mapPoint(map, ox, oz) {
  return {
    x: map.p0.x + map.bx.x * ox + map.bz.x * oz,
    y: map.p0.y + map.bx.y * ox + map.bz.y * oz,
  };
}

function drawMapLine(map, x1, z1, x2, z2, width, color) {
  const a = mapPoint(map, x1, z1);
  const b = mapPoint(map, x2, z2);
  if (!mapSegmentVisible(a, b, width)) return;
  octx.strokeStyle = color;
  octx.lineWidth = Math.max(1, width);
  octx.lineCap = 'butt';
  octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke();
}

function drawMapPolyline(map, pts, width, color) {
  octx.strokeStyle = color;
  octx.lineWidth = Math.max(1, width);
  octx.lineCap = 'round';
  octx.lineJoin = 'round';
  octx.beginPath();
  pts.forEach(([x, z], i) => {
    const p = mapPoint(map, x, z);
    if (i === 0) octx.moveTo(p.x, p.y);
    else octx.lineTo(p.x, p.y);
  });
  octx.stroke();
}

function drawMapRect(map, ox, oz, ww, dd, color, alpha = 1, rot = 0) {
  const c = mapPoint(map, ox, oz);
  const rx = mapPoint(map, ox + ww * 0.5, oz);
  const rz = mapPoint(map, ox, oz + dd * 0.5);
  const sw = Math.max(1, Math.hypot(rx.x - c.x, rx.y - c.y) * 2);
  const sh = Math.max(1, Math.hypot(rz.x - c.x, rz.y - c.y) * 2);
  if (c.x < -sw || c.x > W + sw || c.y < -sh || c.y > H + sh) return;
  octx.save();
  octx.translate(c.x, c.y);
  octx.rotate(rot);
  octx.globalAlpha *= alpha;
  octx.fillStyle = color;
  octx.fillRect(-sw / 2, -sh / 2, sw, sh);
  octx.restore();
}

function mapSegmentVisible(a, b, width) {
  return !(Math.max(a.x, b.x) < -width || Math.min(a.x, b.x) > W + width || Math.max(a.y, b.y) < -width || Math.min(a.y, b.y) > H + width);
}

function drawRailMap(map, scale) {
  drawMapRect(map, -445, -260, 780, 340, '#34382f', 0.76);
  for (let i = 0; i < 7; i++) {
    const z = -390 + i * 46;
    drawMapLine(map, -820, z - 8, -70, z - 8, 3 * scale, 'rgba(18,19,18,0.95)');
    drawMapLine(map, -820, z + 8, -70, z + 8, 3 * scale, 'rgba(18,19,18,0.95)');
  }
  for (let i = 0; i < 13; i++) drawMapRect(map, -760 + i * 52, -345 + (i % 4) * 46, 54, 22, '#5b3d32', 0.96);
}

function drawFactoryMap(map) {
  drawMapRect(map, 0, 0, 440, 250, '#31362f', 0.98);
  drawMapRect(map, 0, 0, 260, 88, '#b8ad91', 1);
  drawMapRect(map, 158, 14, 92, 64, '#806b54', 1);
  drawMapRect(map, -170, 42, 70, 48, '#8c846f', 1);
  for (let i = 0; i < 8; i++) {
    const x0 = -112 + i * 32;
    const a = mapPoint(map, x0 - 12, -44);
    const b = mapPoint(map, x0 + 16, -44);
    const c = mapPoint(map, x0 + 2, -68);
    octx.fillStyle = '#34382f';
    octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.lineTo(c.x, c.y); octx.closePath(); octx.fill();
    drawMapLine(map, x0 - 4, -30, x0 + 10, 36, 5, 'rgba(177,205,191,0.72)');
  }
  for (const x of [-88, 88]) {
    drawMapRect(map, x, -54, 22, 22, '#2f342f', 1);
    const p = mapPoint(map, x + 8, -70);
    octx.fillStyle = 'rgba(44,45,45,0.35)';
    octx.beginPath(); octx.arc(p.x, p.y, Math.max(3, Math.min(W, H) * 0.01), 0, Math.PI * 2); octx.fill();
  }
  octx.strokeStyle = 'rgba(230,184,77,0.88)';
  octx.lineWidth = Math.max(1.5, Math.min(W, H) * 0.0025);
  const p = mapPoint(map, 0, 0);
  const r = Math.max(15, Math.min(W, H) * 0.038);
  octx.strokeRect(p.x - r * 2.5, p.y - r * 1.45, r * 5, r * 2.9);
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
  const baseFs = Math.max(12, H * 0.026), lh = baseFs * 1.4, baseY = H * 0.1;
  octx.textAlign = 'center';
  const n = state.radio.length;
  for (let i = 0; i < n; i++) {
    const m = state.radio[i], y = baseY + i * lh, al = Math.min(1, m.t / 1.5);
    const c = m.level === 'alert' ? '224,88,74' : m.level === 'warn' ? '230,184,77' : '215,227,236';
    let fs = baseFs;
    octx.font = `bold ${fs}px "Courier New", monospace`;
    let tw = octx.measureText(m.text).width + 20;
    if (tw > W - 24) {
      fs *= (W - 24) / tw;
      octx.font = `bold ${fs}px "Courier New", monospace`;
      tw = octx.measureText(m.text).width + 20;
    }
    octx.fillStyle = `rgba(0,0,0,${0.4 * al})`; rr(octx, W / 2 - tw / 2, y - fs, tw, fs * 1.3, 4); octx.fill();
    octx.fillStyle = `rgba(${c},${al})`; octx.fillText(m.text, W / 2, y);
  }
  octx.textAlign = 'left';
}
function drawFlakFlash() {
  const f = state.flakFlash || 0;
  if (f <= 0) return;
  const a = Math.min(1, f);
  octx.save();
  const cx = W * (0.35 + 0.3 * Math.sin(clock * 7.3));
  const cy = H * (0.22 + 0.12 * Math.cos(clock * 5.1));
  const g = octx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.45);
  g.addColorStop(0, `rgba(255,225,150,${0.18 * a})`);
  g.addColorStop(0.18, `rgba(70,68,60,${0.10 * a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  octx.fillStyle = g;
  octx.fillRect(0, 0, W, H);
  octx.strokeStyle = `rgba(25,26,24,${0.35 * a})`;
  octx.lineWidth = Math.max(2, W * 0.0025);
  octx.beginPath();
  octx.arc(cx, cy, Math.max(W, H) * (0.08 + (1 - a) * 0.16), 0, Math.PI * 2);
  octx.stroke();
  octx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

loadCockpit('./assets/cockpit-expanded-masked.png').then(() => { cockpitReady = true; });
showBriefing();
requestAnimationFrame(tick);

window.__game = { eng, camera, state, fighters, switchTo, fire, takeOff, enterBombRun, dropBombs, enterResults, spawnFlakBurst, spawnFlakSalvo };
