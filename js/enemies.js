// Enemy fighters: wave scheduling, simple approach/attack AI, and the shared
// screen-projection used by both rendering and hit-testing.

import { GAME } from './config.js';
import { activeArc } from './stations.js';

function spawnFighter(state, arc) {
  state.fighters.push({
    arc,
    t: 0,                                  // approach progress 0 (far) -> 1 (close)
    sx: (Math.random() * 2 - 1) * 0.8,     // horizontal slot within the view
    sy: (Math.random() * 2 - 1) * 0.6,     // vertical slot within the view
    drift: (Math.random() * 2 - 1) * 0.12, // slight lateral drift while closing
    hp: GAME.fighterHp,
    passesLeft: GAME.fighterPasses,
    fireTimer: GAME.fighterFireInterval,
    dying: 0,                              // >0 while exploding
  });
}

export function updateEnemies(state, dt) {
  const m = state.mission;
  state._cruiseClock = (state._cruiseClock || 0) + dt;

  // Trigger waves once the plane reaches their route position.
  for (let i = 0; i < m.waves.length; i++) {
    if (state._wavesFired.has(i)) continue;
    const w = m.waves[i];
    if (state.plane.position >= w.at) {
      state._wavesFired.add(i);
      for (let k = 0; k < w.count; k++) {
        state._spawnQueue.push({ arc: w.arc, due: state._cruiseClock + k * (w.interval || 1.4) });
      }
    }
  }

  // Release queued spawns when due.
  for (let i = state._spawnQueue.length - 1; i >= 0; i--) {
    if (state._cruiseClock >= state._spawnQueue[i].due) {
      spawnFighter(state, state._spawnQueue[i].arc);
      state._spawnQueue.splice(i, 1);
    }
  }

  // Update each fighter.
  for (let i = state.fighters.length - 1; i >= 0; i--) {
    const f = state.fighters[i];

    if (f.dying > 0) {
      f.dying -= dt;
      if (f.dying <= 0) state.fighters.splice(i, 1);
      continue;
    }

    f.t = Math.min(1, f.t + GAME.fighterApproachSpeed * dt);
    f.sx += f.drift * dt;

    // Once in range, it makes firing passes at the bomber until driven off.
    if (f.t >= GAME.fighterAttackAt && f.passesLeft > 0) {
      f.fireTimer -= dt;
      if (f.fireTimer <= 0) {
        f.fireTimer = GAME.fighterFireInterval;
        f.passesLeft -= 1;
        state.plane.health = Math.max(0, state.plane.health - GAME.fighterDamage);
        f.incoming = 0.25; // brief incoming-tracer flash
        if (f.passesLeft <= 0) f.t = 1; // peels off next
      }
    }

    if (f.incoming > 0) f.incoming -= dt;

    // After its passes are spent it breaks away and is gone.
    if (f.passesLeft <= 0 && f.fireTimer < GAME.fighterFireInterval - 0.4) {
      state.fighters.splice(i, 1);
    }
  }
}

// Project a fighter into screen space for the currently-active station view.
export function projectFighter(f, vp) {
  const cx = vp.w / 2;
  const cy = vp.h * 0.42;
  const scale = vp.h / 540;
  const size = (10 + 70 * f.t) * scale;
  const x = cx + f.sx * vp.w * 0.36;
  const y = cy + f.sy * vp.h * 0.24;
  return { x, y, size };
}

export function killFighter(state, f) {
  if (f.dying > 0) return;
  f.dying = 0.45;
  f.hp = 0;
  state.kills += 1;
}

// Arcs that currently have a live, close fighter — drives the HUD threat flash.
export function arcsUnderThreat(state) {
  const set = new Set();
  for (const f of state.fighters) {
    if (f.dying <= 0 && f.t >= GAME.threatT) set.add(f.arc);
  }
  return set;
}

// Live fighters the player can currently shoot (active arc, on screen).
export function activeFighters(state) {
  const arc = activeArc(state);
  return state.fighters.filter((f) => f.arc === arc && f.dying <= 0 && f.t > 0.04);
}
