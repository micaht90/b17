// Damage model: a connecting hit (fighter pass or flak burst) rolls a location
// and applies a real, distinct effect to the airframe.

import { DAMAGE, FIRE } from './config.js';
import { STATIONS } from './stations.js';
import { radioHit, radioFire } from './radio.js';

function weightedLocation() {
  const w = DAMAGE.locationWeights;
  const entries = Object.entries(w);
  let total = 0;
  for (const [, v] of entries) total += v;
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return 'hull';
}

function randomStation(state, predicate) {
  const pool = STATIONS.filter((s) => predicate(state.stations[s.id]));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function applyHit(state, kind) {
  const baseHull = kind === 'flak' ? DAMAGE.hullLossFlak : DAMAGE.hullLossFighter;
  // Bracing softens a flak burst.
  const braceMult = state.brace > 0 && kind === 'flak' ? 0.4 : 1;
  let location = weightedLocation();

  if (location === 'engine') {
    const idx = state.systems.engines.findIndex((e) => e);
    if (idx >= 0) {
      state.systems.engines[idx] = false;
      if (Math.random() < FIRE.igniteChance) {
        state.systems.engineFire[idx] = true;
        radioFire(state, idx + 1);
      } else {
        radioHit(state, 'engine');
      }
    } else location = 'hull';
  } else if (location === 'fuel') {
    state.systems.fuelLeak += DAMAGE.fuelLeakPerHit;
    radioHit(state, 'fuel');
  } else if (location === 'gun') {
    const id = randomStation(state, (st) => !st.disabled);
    if (id) { state.stations[id].disabled = true; state.stations[id].jammed = false; radioHit(state, 'gun'); }
    else location = 'hull';
  } else if (location === 'gunner') {
    const id = randomStation(state, (st) => !st.wounded && !st.disabled);
    if (id) { state.stations[id].wounded = true; radioHit(state, 'gunner'); }
    else location = 'hull';
  }

  const hullLoss = (location === 'hull' ? baseHull : baseHull * 0.7) * braceMult;
  state.plane.health = Math.max(0, state.plane.health - hullLoss);

  state.shake = Math.min(1, state.shake + (kind === 'flak' ? 0.9 : 0.55));
  state.hitFlash = Math.min(1, state.hitFlash + 0.7);
  state.lastHit = { location, t: 0.9 };
  return location;
}
