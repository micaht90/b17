// Aiming, firing, and hit detection against fighters in the active arc.

import { GAME } from './config.js';
import { projectFighter, killFighter, activeFighters } from './enemies.js';

// Smooth the crosshair toward the raw aim point (frame-rate aware lerp).
export function updateCrosshair(state, vp, dt) {
  if (!state.aim.has) {
    if (state.crosshair.x === 0 && state.crosshair.y === 0) {
      state.crosshair.x = vp.w / 2;
      state.crosshair.y = vp.h * 0.42;
    }
    return;
  }
  const a = 1 - Math.pow(1 - GAME.crosshairLerp, dt * 60);
  state.crosshair.x += (state.aim.x - state.crosshair.x) * a;
  state.crosshair.y += (state.aim.y - state.crosshair.y) * a;
}

// Handle the trigger being held: respects fire rate and per-station ammo.
export function updateFiring(state, vp, dt, firing) {
  state.fireCooldown -= dt;
  // Decay tracers.
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    state.tracers[i].life -= dt;
    if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
  }
  if (!firing) return;

  const station = state.stations[state.activeStation];
  if (station.ammo <= 0) return;

  while (state.fireCooldown <= 0) {
    state.fireCooldown += 1 / GAME.fireRate;
    if (station.ammo <= 0) break;
    station.ammo -= 1;
    fireOneShot(state, vp);
  }
}

function fireOneShot(state, vp) {
  const cx = state.crosshair.x;
  const cy = state.crosshair.y;

  // Muzzle tracer from the bottom of the view toward the crosshair.
  state.tracers.push({ x1: vp.w / 2, y1: vp.h * 0.92, x2: cx, y2: cy, life: 0.06 });

  // Find the nearest in-arc fighter under the crosshair.
  let best = null;
  let bestDist = Infinity;
  for (const f of activeFighters(state)) {
    const p = projectFighter(f, vp);
    const r = GAME.hitBaseRadius * (0.45 + 0.9 * f.t);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d <= r && d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  if (best) {
    best.hp -= 1;
    if (best.hp <= 0) killFighter(state, best);
  }
}
