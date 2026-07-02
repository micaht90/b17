// The living sky: the player's combat-box formation with engine contrails,
// friendly escort fighters sweeping high overhead, and ambient enemy passes on
// the OTHER bombers in the distance — a war the gunner can watch between real
// attacks. Everything is pooled at build time; update() allocates nothing.
//
// Headings: the player flies toward -Z and the aircraft models' noses point at
// local -Z, so a wingman on the same heading has rotation.y = 0. Emitted puffs
// hang in the air and stream past at the world scroll rate (60 * speed, the
// same rate engine.js uses for clouds).

import * as THREE from 'three';
import { makeBomber, makeFighter } from './aircraft.js';

// --- Scratch (never allocate in update) -----------------------------------------
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// --- Tuning ----------------------------------------------------------------------
const TRAIL_PER_SHIP = 16;   // ring-buffer sprites per bomber (8 * 16 = 128 total)
const TRAIL_LIFE = 2.5;      // seconds a condensation puff lives
const TRAIL_SPAWN = 0.12;    // seconds between puffs
const TRACER_LIFE = 0.3;
const SMOKE_LIFE = 1.6;
const ESCORT_DUR = 8;        // seconds for one escort sweep

// Combat-box slots around the player (the player is the empty slot at origin):
// a lead 3-ship vic ahead/above, a high element stacked off the right wing, a
// low element left and behind. Nearest ships sit ~115-125 out so the box reads
// as flying formation, not scenery; the deep high ship is ~370.
const SLOTS = [
  [0, 24, -158], [-62, 16, -96], [66, 18, -104],   // lead vic (ahead, above)
  [148, 52, -30], [212, 68, 55], [300, 96, 190],   // high element, right
  [-128, -42, 88], [-210, -60, 180],               // low element, left-behind
];

// --- Public API --------------------------------------------------------------------
export function createFormation(scene) {
  const puffTex = makePuffTexture();
  const trailMatBase = new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.35, depthWrite: false });
  const smokeMatBase = new THREE.SpriteMaterial({ map: puffTex, color: 0x2b2d2e, transparent: true, opacity: 0.55, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.4, 0.4, 10);
  const tracerMatBase = new THREE.MeshBasicMaterial({
    color: 0xffeeb0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  // --- Combat box: 8 B-17s with per-ship bob/sway, prop lists, contrail rings ----
  const ships = [];
  for (const p of SLOTS) {
    const g = makeBomber();
    g.scale.setScalar(1.6);
    g.position.set(p[0], p[1], p[2]);
    g.rotation.y = 0;                                  // nose is -Z: same heading as player
    scene.add(g);
    const props = [];                                  // collected ONCE; never traverse per frame
    g.traverse((n) => { if (n.userData.spin) props.push(n); });
    const ship = {
      g, props,
      base: new THREE.Vector3(p[0], p[1], p[2]),
      phase: Math.random() * Math.PI * 2,
      bobAmp: 2 + Math.random() * 3,
      bobRate: 0.35 + Math.random() * 0.25,
      rollRate: 0.3 + Math.random() * 0.3,
      spin: 30 + Math.random() * 15,
      puffs: [], head: 0,
      trailT: Math.random() * TRAIL_SPAWN,
    };
    for (let i = 0; i < TRAIL_PER_SHIP; i++) {
      const s = new THREE.Sprite(trailMatBase.clone());
      s.visible = false;
      scene.add(s);
      ship.puffs.push({ s, age: TRAIL_LIFE });
    }
    ships.push(ship);
  }
  // Ambient attacks only pick on far ships so the shooting never crowds the player.
  const targets = ships.filter((s) => s.base.length() >= 180);

  // --- Escort pair: bare-metal friendlies that flash across high above -----------
  const escorts = [];
  for (let i = 0; i < 2; i++) {
    const f = makeFighter();
    silverize(f);
    f.scale.setScalar(3);
    f.visible = false;
    scene.add(f);
    escorts.push(f);
  }
  const escortVel = new THREE.Vector3();
  let escortOn = false, escortT = 0;
  let escortTimer = 26 + Math.random() * 16;           // first sweep comes early; then 45-75s

  function launchEscort() {
    escortOn = true; escortT = 0;
    const dir = Math.random() < 0.5 ? 1 : -1;          // enter from +X or -X
    const y = 210 + Math.random() * 90;
    const z = -(120 + Math.random() * 280);
    escortVel.set(-dir * 172, 0, (Math.random() - 0.5) * 28);
    for (let i = 0; i < 2; i++) {
      const f = escorts[i];
      f.position.set(dir * (690 + i * 42), y + i * 10, z + i * 24);   // wingman trails out/up
      f.visible = true;
      // Nose is -Z: lookAt a point BEHIND the motion (same trick as game.js).
      _a.copy(f.position).sub(escortVel);
      f.lookAt(_a);
      f.rotateZ(dir * 0.28);                           // gentle bank into the sweep
    }
  }

  // --- Ambient war: enemy fighters making passes on distant bombers --------------
  const enemies = [];
  for (let i = 0; i < 3; i++) {
    const f = makeFighter();
    f.scale.setScalar(3);
    f.visible = false;
    scene.add(f);
    const tracers = [];
    for (let t = 0; t < 3; t++) {
      const m = new THREE.Mesh(tracerGeo, tracerMatBase.clone());
      m.visible = false;
      scene.add(m);
      tracers.push({ m, vel: new THREE.Vector3(), life: 0 });
    }
    enemies.push({
      f, tracers, vel: new THREE.Vector3(),
      target: null, life: 0, dur: 0, fireCool: 0,
      wantSmoke: false, smoked: false, active: false,
    });
  }
  let attackTimer = 12 + Math.random() * 14;

  function launchAttack() {
    let e = null;
    for (const x of enemies) if (!x.active) { e = x; break; }
    if (!e || !targets.length) return;
    e.target = targets[(Math.random() * targets.length) | 0];
    // Roll in from ahead/above the victim, offset to one side, ~300 units out.
    _a.set(
      (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 90),
      70 + Math.random() * 70,
      -(190 + Math.random() * 80),
    ).normalize().multiplyScalar(290 + Math.random() * 40);
    e.f.position.copy(e.target.g.position).add(_a);
    // Aim just under and beside the bomber so the pass slices close but never clips it.
    _b.copy(e.target.g.position);
    _b.x += (Math.random() - 0.5) * 18;
    _b.y -= 6 + Math.random() * 6;
    _b.sub(e.f.position);
    const approach = _b.length();
    const spd = 115 + Math.random() * 35;
    e.vel.copy(_b).normalize().multiplyScalar(spd);
    e.life = 0;
    e.dur = (approach + 250) / spd;                    // fly through, extend away, vanish
    e.fireCool = 0.12;
    e.wantSmoke = Math.random() < 0.3;
    e.smoked = false;
    e.active = true;
    e.f.visible = true;
    _a.copy(e.f.position).sub(e.vel);                  // straight pass: orient once at spawn
    e.f.lookAt(_a);
    e.f.rotateZ((Math.random() - 0.5) * 0.9);
  }

  function fireTracer(e) {
    let t = null;
    for (const x of e.tracers) if (x.life <= 0) { t = x; break; }
    if (!t) return;
    _b.copy(e.target.g.position).sub(e.f.position).normalize();
    _b.x += (Math.random() - 0.5) * 0.06;              // slight dispersion
    _b.y += (Math.random() - 0.5) * 0.06;
    _b.normalize();
    t.vel.copy(_b).multiplyScalar(420);
    t.m.position.copy(e.f.position).addScaledVector(_b, 10);
    _a.copy(t.m.position).add(t.vel);
    t.m.lookAt(_a);                                    // long axis along the streak
    t.life = TRACER_LIFE;
    t.m.visible = true;
    t.m.material.opacity = 0.9;
  }

  // --- Damage smoke: brief dark puffs on an attacked bomber (it never dies) ------
  const smoke = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(smokeMatBase.clone());
    s.visible = false;
    scene.add(s);
    smoke.push({ s, age: SMOKE_LIFE });
  }

  function puffSmoke(pos) {
    let n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (const p of smoke) {
      if (n <= 0) break;
      if (p.age < SMOKE_LIFE) continue;                // still busy fading
      n--;
      p.age = 0;
      p.s.visible = true;
      p.s.material.opacity = 0.55;
      p.s.scale.set(7, 7, 1);
      p.s.position.set(
        pos.x + (Math.random() - 0.5) * 12,
        pos.y + 1 + (Math.random() - 0.5) * 6,
        pos.z + (Math.random() - 0.5) * 10,
      );
    }
  }

  // --- Contrail spawn: one puff behind the tail, recycled through a ring ---------
  function spawnPuff(ship) {
    const p = ship.puffs[ship.head];
    ship.head = (ship.head + 1) % TRAIL_PER_SHIP;
    p.age = 0;
    p.s.visible = true;
    p.s.material.opacity = 0;
    p.s.scale.set(5, 5, 1);
    const g = ship.g.position;
    p.s.position.set(
      g.x + (Math.random() - 0.5) * 2.5,
      g.y - 0.6 + (Math.random() - 0.5) * 1.5,
      g.z + 11 + (Math.random() - 0.5) * 2,
    );
  }

  // --- Update ---------------------------------------------------------------------
  let combat = true;
  let time = 0;

  function update(dt, opts) {
    dt = Math.min(dt || 0, 0.1);
    if (dt <= 0) return;
    const speed = (opts && opts.speed) || 1;
    const scroll = 60 * speed;                         // world scroll rate (engine.js clouds)
    time += dt;

    // Bombers: bob, sway, spin props, trail condensation.
    for (const ship of ships) {
      const g = ship.g;
      g.position.y = ship.base.y + Math.sin(time * ship.bobRate + ship.phase) * ship.bobAmp;
      g.rotation.z = Math.sin(time * ship.rollRate + ship.phase * 1.7) * 0.02;
      for (const p of ship.props) p.rotation.z += dt * ship.spin;
      ship.trailT -= dt;
      if (ship.trailT <= 0) { ship.trailT += TRAIL_SPAWN; spawnPuff(ship); }
      for (const p of ship.puffs) {
        if (p.age >= TRAIL_LIFE) continue;
        p.age += dt;
        if (p.age >= TRAIL_LIFE) { p.s.visible = false; continue; }
        const k = p.age / TRAIL_LIFE;
        p.s.position.z += scroll * dt;                 // puff hangs in the air, world slides by
        const sc = 5 + k * 12;
        p.s.scale.set(sc, sc, 1);
        p.s.material.opacity = 0.35 * Math.min(1, p.age * 8) * (1 - k);
      }
    }

    if (combat) {
      // Escort sweep.
      if (escortOn) {
        escortT += dt;
        for (const f of escorts) {
          f.position.addScaledVector(escortVel, dt);
          f.userData.prop.rotation.z += dt * 44;
        }
        if (escortT >= ESCORT_DUR) {
          escortOn = false;
          for (const f of escorts) f.visible = false;
        }
      } else {
        escortTimer -= dt;
        if (escortTimer <= 0) { escortTimer = 45 + Math.random() * 30; launchEscort(); }
      }

      // Ambient enemy passes.
      attackTimer -= dt;
      if (attackTimer <= 0) { attackTimer = 18 + Math.random() * 14; launchAttack(); }
      for (const e of enemies) {
        if (e.active) {
          e.life += dt;
          e.f.position.addScaledVector(e.vel, dt);
          e.f.userData.prop.rotation.z += dt * 42;
          _a.copy(e.target.g.position).sub(e.f.position);
          const dist = _a.length();
          if (dist < 300 && _a.dot(e.vel) > 0) {       // closing and in range: guns
            e.fireCool -= dt;
            if (e.fireCool <= 0) { e.fireCool = 0.09 + Math.random() * 0.07; fireTracer(e); }
            if (e.wantSmoke && !e.smoked && dist < 110) { e.smoked = true; puffSmoke(e.target.g.position); }
          }
          if (e.life >= e.dur) { e.active = false; e.f.visible = false; }
        }
        for (const t of e.tracers) {                   // tracers outlive the pass end
          if (t.life <= 0) continue;
          t.life -= dt;
          if (t.life <= 0) { t.m.visible = false; continue; }
          t.m.position.addScaledVector(t.vel, dt);
          t.m.material.opacity = 0.9 * (t.life / TRACER_LIFE);
        }
      }
    }

    // Smoke fades out regardless of phase.
    for (const p of smoke) {
      if (p.age >= SMOKE_LIFE) continue;
      p.age += dt;
      if (p.age >= SMOKE_LIFE) { p.s.visible = false; continue; }
      const k = p.age / SMOKE_LIFE;
      p.s.position.z += scroll * dt * 0.7;
      p.s.position.y += dt * 3;
      const sc = 7 + k * 15;
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = 0.55 * (1 - k);
    }
  }

  // Hide the ambient combatants during briefing/bombrun/results; bombers stay.
  function setCombat(active) {
    combat = !!active;
    if (combat) return;
    escortOn = false;
    for (const f of escorts) f.visible = false;
    for (const e of enemies) {
      e.active = false;
      e.f.visible = false;
      for (const t of e.tracers) { t.life = 0; t.m.visible = false; }
    }
    for (const p of smoke) { p.age = SMOKE_LIFE; p.s.visible = false; }
  }

  return { update, setCombat };
}

// --- Helpers ------------------------------------------------------------------------

// Re-skin a fighter as a bare-metal friendly: clone the airframe materials and
// paint them silver. The red spinner, canopy glass and prop parts keep their
// colours (clones only, so enemy fighters stay camouflaged).
const CAMO = new Set([0x656d51, 0x2a3028, 0x9ca8ad, 0xd7d8c6]);
function silverize(f) {
  f.traverse((n) => {
    if (!n.isMesh || !n.material || !n.material.color) return;
    if (!CAMO.has(n.material.color.getHex())) return;
    n.material = n.material.clone();
    n.material.color.setHex(0xb9c4cd);
    n.material.metalness = 0.6;
    n.material.roughness = 0.32;
  });
}

// Soft white radial puff for contrails and smoke (normal alpha blending).
function makePuffTexture() {
  const N = 64, r = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
