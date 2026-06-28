// Flak: ambient anti-aircraft fire in the target zone. Not dodgeable by
// station-switching — it pressures the player to get through fast / high.

import { GAME, CONTROL } from './config.js';
import { applyHit } from './damage.js';
import { pushRadio } from './radio.js';

export function inFlakZone(state) {
  for (const z of state.mission.flakZones) {
    if (state.plane.position >= z.from && state.plane.position <= z.to) return z;
  }
  return null;
}

export function updateFlak(state, dt) {
  const zone = inFlakZone(state);

  if (zone) {
    if (!state.warned.flak) {
      state.warned.flak = true;
      pushRadio(state, 'Flak ahead — bombardier, stand by!', 'warn');
    }
    state._flakTimer = (state._flakTimer || 0) - dt;
    if (state._flakTimer <= 0) {
      state._flakTimer = (0.6 + Math.random() * 0.9) / zone.intensity;
      state.flak.push({
        sx: (Math.random() * 2 - 1) * 0.85,
        sy: (Math.random() * 2 - 1) * 0.7,
        age: 0,
        fuse: 0.25 + Math.random() * 0.25,
        exploded: false,
        intensity: zone.intensity,
      });
    }
  }

  for (let i = state.flak.length - 1; i >= 0; i--) {
    const b = state.flak[i];
    b.age += dt;
    if (!b.exploded && b.age >= b.fuse) {
      b.exploded = true;
      let chance = b.intensity * 0.4 * (state.lowAltitude ? GAME.flakLowAltMultiplier : 1);
      if (state.evade.active > 0) chance *= CONTROL.evadeFlakMult;
      if (Math.random() < chance) {
        applyHit(state, 'flak');
        b.hit = true;
      }
    }
    if (b.age >= b.fuse + 0.6) state.flak.splice(i, 1);
  }
}
