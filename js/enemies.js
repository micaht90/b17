// Enemy fighters: wave scheduling and a believable attack-run AI
// (ingress -> firing pass with a telegraph -> break away), plus the shared
// screen-projection used by both rendering and hit-testing.

import { GUN, FIGHTER } from './config.js';
import { activeArc } from './stations.js';
import { applyHit } from './damage.js';
import { radioBandit, radioIncoming, radioKill } from './radio.js';

function spawnFighter(state, arc) {
  radioBandit(state, arc);
  state.fighters.push({
    arc,
    t: 0,
    baseSx: (Math.random() * 2 - 1) * 0.7,
    sy: (Math.random() * 2 - 1) * 0.5,
    weavePhase: Math.random() * Math.PI * 2,
    sx: 0,
    bank: 0,
    hp: GUN.fighterHp,
    state: 'ingress',
    warn: 0,
    shotsLeft: FIGHTER.shotsPerPass,
    fireTimer: 0,
    dying: 0,
  });
}

export function updateEnemies(state, dt) {
  const m = state.mission;
  state._cruiseClock = (state._cruiseClock || 0) + dt;

  for (let i = 0; i < m.waves.length; i++) {
    if (state._wavesFired.has(i)) continue;
    const w = m.waves[i];
    if (state.plane.position >= w.at) {
      state._wavesFired.add(i);
      for (let k = 0; k < w.count; k++) {
        state._spawnQueue.push({ arc: w.arc, due: state._cruiseClock + k * (w.interval || 2.0) });
      }
    }
  }

  // Release queued spawns when due — but cap how many attack at once.
  let live = state.fighters.filter((f) => f.dying <= 0).length;
  for (let i = state._spawnQueue.length - 1; i >= 0; i--) {
    if (state._cruiseClock >= state._spawnQueue[i].due && live < FIGHTER.maxConcurrent) {
      spawnFighter(state, state._spawnQueue[i].arc);
      live++;
      state._spawnQueue.splice(i, 1);
    }
  }

  for (let i = state.fighters.length - 1; i >= 0; i--) {
    const f = state.fighters[i];

    if (f.dying > 0) {
      f.dying -= dt;
      if (f.dying <= 0) state.fighters.splice(i, 1);
      continue;
    }

    // Weave + bank for life.
    f.weavePhase += FIGHTER.weaveRate * dt;
    const prevSx = f.sx;
    f.sx = f.baseSx + Math.sin(f.weavePhase) * FIGHTER.weaveAmp;
    f.bank = Math.max(-1, Math.min(1, (f.sx - prevSx) / (dt || 0.016) * 0.5));

    if (f.state === 'ingress') {
      f.t = Math.min(FIGHTER.passAt, f.t + FIGHTER.ingressSpeed * dt);
      if (f.t >= FIGHTER.passAt) {
        f.state = 'pass';
        f.warn = FIGHTER.warnTime;
        f.fireTimer = 0;
        radioIncoming(state, f.arc);
      }
    } else if (f.state === 'pass') {
      // Hold roughly in close while making the firing pass.
      f.t = Math.min(1, f.t + 0.05 * dt);
      if (f.warn > 0) {
        f.warn -= dt;
      } else {
        f.fireTimer -= dt;
        if (f.fireTimer <= 0 && f.shotsLeft > 0) {
          f.fireTimer = FIGHTER.shotInterval;
          f.shotsLeft -= 1;
          f.muzzle = 0.12;
          // Incoming tracer toward the bomber.
          state.enemyTracers.push({ from: f, life: 0.12 });
          if (Math.random() < FIGHTER.shotHitChance) applyHit(state, 'fighter');
          if (f.shotsLeft <= 0) f.state = 'break';
        }
      }
    } else if (f.state === 'break') {
      // Peel away: climb out of frame and fade.
      f.t += FIGHTER.breakSpeed * dt;
      f.baseSx += Math.sign(f.baseSx || 1) * 0.6 * dt;
      if (f.t >= 1.5) state.fighters.splice(i, 1);
    }

    if (f.muzzle > 0) f.muzzle -= dt;
  }

  // Decay incoming tracers.
  for (let i = state.enemyTracers.length - 1; i >= 0; i--) {
    state.enemyTracers[i].life -= dt;
    if (state.enemyTracers[i].life <= 0) state.enemyTracers.splice(i, 1);
  }
}

// Project a fighter into screen space for the active station view.
export function projectFighter(f, vp) {
  const cx = vp.w / 2;
  const cy = vp.h * 0.42;
  const scale = vp.h / 540;
  const tt = Math.min(1, f.t);
  const size = (12 + 78 * tt) * scale;
  const breakOut = f.t > 1 ? (f.t - 1) : 0;
  const x = cx + (f.sx + Math.sign(f.baseSx || 1) * breakOut * 0.9) * vp.w * 0.36;
  const y = cy + (f.sy - breakOut * 0.5) * vp.h * 0.24;
  const alpha = f.t > 1 ? Math.max(0, 1 - breakOut / 0.5) : 1;
  return { x, y, size, alpha };
}

export function killFighter(state, f) {
  if (f.dying > 0) return;
  f.dying = 0.5;
  f.hp = 0;
  state.kills += 1;
  radioKill(state);
}

// Arcs with a live fighter that is close or attacking — drives the HUD flash.
export function arcsUnderThreat(state) {
  const set = new Set();
  for (const f of state.fighters) {
    if (f.dying <= 0 && (f.state === 'pass' || f.t >= 0.5)) set.add(f.arc);
  }
  return set;
}

// Live fighters the player can currently shoot (active arc, on screen).
export function activeFighters(state) {
  const arc = activeArc(state);
  return state.fighters.filter((f) => f.arc === arc && f.dying <= 0 && f.t > 0.05 && f.t <= 1.05);
}
