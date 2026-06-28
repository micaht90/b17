// Weighty-but-direct gunnery: heavy aim clamped to the gun's traverse, shot
// spread that blooms with sustained fire/heat/recoil, and barrel overheating
// with jams. Bullets hit where pointed (within spread) — no leading needed.

import { GUN, DAMAGE, GUNS, TWIN_RATE_MULT, CONTROL } from './config.js';
import { clampToTraverse } from './stations.js';
import { projectFighter, killFighter, activeFighters } from './enemies.js';

export function isGunView(state) {
  return !!state.stations[state.activeStation];
}

export function updateCrosshair(state, vp, dt) {
  if (state.crosshair.x === 0 && state.crosshair.y === 0) {
    state.crosshair.x = vp.w / 2;
    state.crosshair.y = vp.h * 0.42;
  }
  if (!isGunView(state) || !state.aim.has) return;

  const clamped = clampToTraverse(state.activeStation, state.aim.x, state.aim.y, vp);
  const a = 1 - Math.pow(1 - GUN.aimLerp, dt * 60);
  state.crosshair.x += (clamped.x - state.crosshair.x) * a;
  state.crosshair.y += (clamped.y - state.crosshair.y) * a;
}

// Current shot-spread radius in px for the active gun.
export function currentSpread(state) {
  const st = state.stations[state.activeStation];
  if (!st) return GUN.spreadPx;
  let s = GUN.spreadPx + state.gunBloom + st.heat * GUN.spreadPerHeat;
  if (st.wounded) s *= DAMAGE.gunnerSpreadPenalty;
  if (state.evade.active > 0) s *= CONTROL.evadeAimPenalty;
  return s;
}

export function canFire(state) {
  const st = state.stations[state.activeStation];
  return !st.disabled && !st.jammed && st.ammo > 0;
}

export function updateFiring(state, vp, dt, firing) {
  // Cool all guns; clear jams once cooled enough.
  for (const id in state.stations) {
    const st = state.stations[id];
    st.heat = Math.max(0, st.heat - GUN.heatCoolPerSec * dt);
    if (st.jammed && st.heat <= GUN.heatResumeAt) st.jammed = false;
  }

  // Settle the recoil bloom.
  state.gunBloom = Math.max(0, state.gunBloom - GUN.bloomDecayPerSec * dt);

  // Decay tracers.
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    if ((state.tracers[i].life -= dt) <= 0) state.tracers.splice(i, 1);
  }

  state.fireCooldown -= dt;
  if (!firing || !isGunView(state)) return;

  const st = state.stations[state.activeStation];
  if (st.disabled || st.jammed) return;

  const twin = GUNS[state.activeStation] && GUNS[state.activeStation].type === 'twin';
  const rate = GUN.fireRate * (twin ? TWIN_RATE_MULT : 1) * (st.wounded ? 1 - DAMAGE.gunnerFireRatePenalty : 1);
  while (state.fireCooldown <= 0) {
    state.fireCooldown += 1 / rate;
    if (st.ammo <= 0 || st.jammed) break;
    st.ammo -= 1;
    st.heat = Math.min(1.2, st.heat + GUN.heatPerShot);
    if (st.heat >= GUN.heatJamAt) st.jammed = true;
    state.gunBloom = Math.min(GUN.bloomMax, state.gunBloom + GUN.bloomPerShot);
    state.crosshair.y -= GUN.recoilKick * (0.6 + Math.random() * 0.6); // muzzle climb
    fireOneShot(state, vp);
    if (st.jammed) break;
  }

  // Keep the muzzle climb within the gun's traverse.
  const c = clampToTraverse(state.activeStation, state.crosshair.x, state.crosshair.y, vp);
  state.crosshair.x = c.x;
  state.crosshair.y = c.y;
}

function fireOneShot(state, vp) {
  const spread = currentSpread(state);
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread; // uniform-ish within the cone
  const sx = state.crosshair.x + Math.cos(ang) * rad;
  const sy = state.crosshair.y + Math.sin(ang) * rad;

  state.tracers.push({ x1: vp.w / 2, y1: vp.h * 0.95, x2: sx, y2: sy, life: 0.07 });

  let best = null;
  let bestDist = Infinity;
  for (const f of activeFighters(state)) {
    const p = projectFighter(f, vp);
    const r = p.size * GUN.hitRadiusScale;
    const d = Math.hypot(p.x - sx, p.y - sy);
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
