// Fuel / weight model (now affected by engine damage and fuel leaks) and the
// three resource-decision levers.

import { GAME, DAMAGE } from './config.js';
import { totalAmmo, enginesOut } from './state.js';

export function computeWeight(state) {
  const m = state.mission;
  const maxAmmo = m.startAmmoPerStation * 6;
  const fuelTerm = (state.plane.fuel / m.startFuel) * GAME.weightFuelTerm;
  const ammoTerm = (totalAmmo(state) / maxAmmo) * 0.12;
  const bombTerm = state.plane.bombsAboard ? 0.16 : 0;
  return 0.55 + fuelTerm + ammoTerm + bombTerm;
}

// Speed multiplier from engine losses and throttle (used by the cruise advance).
export function speedFactor(state) {
  return Math.max(0.5, 1 - 0.12 * enginesOut(state)) * state.throttle;
}

export function updateResources(state, dt) {
  state.weightFactor = computeWeight(state);
  const out = enginesOut(state);
  const burn =
    GAME.fuelBurnPerSec * state.weightFactor * state.throttle * (1 + DAMAGE.engineFuelPenaltyEach * out) +
    state.systems.fuelLeak;
  state.plane.fuel = Math.max(0, state.plane.fuel - burn * dt);
}

// --- Decision levers ---------------------------------------------------------

export function dumpFuel(state) {
  state.plane.fuel = Math.min(state.plane.fuel, 35);
  state.plane.altitude = state.mission.cruiseAltitude;
  state.lowAltitude = false;
  state.decision.choice = 'fuel';
  state.decision.resolved = true;
}

export function jettisonAmmo(state) {
  for (const id in state.stations) {
    state.stations[id].ammo = Math.min(state.stations[id].ammo, 10);
  }
  state.plane.altitude = state.mission.cruiseAltitude;
  state.lowAltitude = false;
  state.decision.choice = 'ammo';
  state.decision.resolved = true;
}

export function pressOn(state) {
  state.lowAltitude = true;
  state.decision.choice = 'press';
  state.decision.resolved = true;
}
