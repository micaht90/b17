// Fuel / weight model and the three resource-decision levers.

import { GAME } from './config.js';
import { totalAmmo } from './state.js';

// Weight factor (~0.6 light .. ~1.1 heavy) drives fuel burn. Pure function.
export function computeWeight(state) {
  const m = state.mission;
  const maxAmmo = m.startAmmoPerStation * 6;
  const fuelTerm = (state.plane.fuel / m.startFuel) * GAME.weightFuelTerm;
  const ammoTerm = (totalAmmo(state) / maxAmmo) * 0.12;
  const bombTerm = state.plane.bombsAboard ? 0.16 : 0;
  return 0.55 + fuelTerm + ammoTerm + bombTerm;
}

// Burn fuel while cruising; heavier plane burns faster.
export function updateResources(state, dt) {
  state.weightFactor = computeWeight(state);
  state.plane.fuel = Math.max(0, state.plane.fuel - GAME.fuelBurnPerSec * state.weightFactor * dt);
}

// --- Decision levers ---------------------------------------------------------
// All three resolve the DECISION phase; each has a distinct, visible tradeoff.

export function dumpFuel(state) {
  // Lighter, climb back to cruise — but a thin reserve (matters for campaign /
  // the fuel score bonus).
  state.plane.fuel = Math.min(state.plane.fuel, 35);
  state.plane.altitude = state.mission.cruiseAltitude;
  state.lowAltitude = false;
  state.decision.choice = 'fuel';
  state.decision.resolved = true;
}

export function jettisonAmmo(state) {
  // Climb back to cruise — but you fight the rest of the route nearly dry.
  for (const id in state.stations) {
    state.stations[id].ammo = Math.min(state.stations[id].ammo, 10);
  }
  state.plane.altitude = state.mission.cruiseAltitude;
  state.lowAltitude = false;
  state.decision.choice = 'ammo';
  state.decision.resolved = true;
}

export function pressOn(state) {
  // Keep everything — but you cross the flak zone low, taking double damage.
  state.lowAltitude = true;
  state.decision.choice = 'press';
  state.decision.resolved = true;
}
