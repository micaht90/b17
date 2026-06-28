// Pilot / cockpit controls and the ongoing effects they manage (engine fires,
// evasive corkscrew, brace, throttle).

import { CONTROL, FIRE } from './config.js';
import { pushRadio } from './radio.js';

export function throttleUp(state) {
  state.throttle = Math.min(CONTROL.throttleMax, +(state.throttle + CONTROL.throttleStep).toFixed(2));
  pushRadio(state, `Throttle up — ${Math.round(state.throttle * 100)}%`, 'info');
}

export function throttleDown(state) {
  state.throttle = Math.max(CONTROL.throttleMin, +(state.throttle - CONTROL.throttleStep).toFixed(2));
  pushRadio(state, `Throttle back — ${Math.round(state.throttle * 100)}%`, 'info');
}

export function hasFire(state) {
  return state.systems.engineFire.some(Boolean);
}

export function extinguish(state) {
  const idx = state.systems.engineFire.findIndex(Boolean);
  if (idx >= 0) {
    state.systems.engineFire[idx] = false;
    pushRadio(state, `Number ${idx + 1} feathered — fire's out!`, 'info');
  }
}

export function sealLeak(state) {
  if (state.systems.fuelLeak > 0) {
    state.systems.fuelLeak = 0;
    pushRadio(state, 'Fuel transfer complete — leak sealed.', 'info');
  }
}

export function evade(state) {
  if (state.evade.cooldown > 0 || state.evade.active > 0) return;
  state.evade.active = CONTROL.evadeDuration;
  state.evade.cooldown = CONTROL.evadeCooldown;
  pushRadio(state, 'Corkscrewing — hang on!', 'alert');
}

export function brace(state) {
  state.brace = CONTROL.braceDuration;
  pushRadio(state, 'Flak — brace! brace!', 'alert');
}

// Per-frame upkeep for control-driven effects.
export function updateControls(state, dt) {
  if (state.evade.active > 0) state.evade.active = Math.max(0, state.evade.active - dt);
  if (state.evade.cooldown > 0) state.evade.cooldown = Math.max(0, state.evade.cooldown - dt);
  if (state.brace > 0) state.brace = Math.max(0, state.brace - dt);

  // Engine fires eat the hull and can spread to another engine.
  for (let i = 0; i < state.systems.engineFire.length; i++) {
    if (!state.systems.engineFire[i]) continue;
    state.plane.health = Math.max(0, state.plane.health - FIRE.dpsHealth * dt);
    if (Math.random() < FIRE.spreadPerSec * dt) {
      const j = state.systems.engines.findIndex((e, k) => e && k !== i);
      if (j >= 0) {
        state.systems.engines[j] = false;
        state.systems.engineFire[j] = true;
        pushRadio(state, `Fire's spreading — number ${j + 1}!`, 'alert');
      }
    }
  }
}
