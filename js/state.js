// The single mutable game-state object. Every system is a function of (state).

import { STATIONS } from './stations.js';
import { getMission } from './data/missions.js';

export const PHASE = {
  BRIEFING: 'briefing',
  CRUISE: 'cruise',
  DECISION: 'decision',
  BOMBRUN: 'bombrun',
  RESULTS: 'results',
};

export function createGameState(missionIndex = 0) {
  const state = {
    missionIndex,
    mission: getMission(missionIndex),
    phase: PHASE.BRIEFING,
    phaseTime: 0,

    plane: { health: 100, altitude: 25000, fuel: 100, position: 0, bombsAboard: true },
    stations: {},
    activeStation: 'nose',
    weightFactor: 1,

    fighters: [],
    flak: [],
    tracers: [],   // transient visual gunfire lines
    kills: 0,

    fireCooldown: 0,

    decision: { triggered: false, resolved: false, choice: null },
    lowAltitude: false,    // pressed on through flak at low altitude

    bomb: null,            // built when entering the bomb run

    result: { won: false, score: 0, breakdown: null },

    // Smoothed crosshair (set in world/CSS px) and the raw aim target.
    crosshair: { x: 0, y: 0 },
    aim: { x: 0, y: 0, has: false },

    // Populated each frame by ui.layoutButtons; consumed by input + render.
    ui: { buttons: [], tappedButton: null, fireRect: null },
  };
  resetMission(state, missionIndex);
  return state;
}

// Reset plane/stations/entities for a fresh attempt at the given mission.
export function resetMission(state, missionIndex = state.missionIndex) {
  const mission = getMission(missionIndex);
  state.missionIndex = missionIndex;
  state.mission = mission;
  state.phase = PHASE.BRIEFING;
  state.phaseTime = 0;

  state.plane.health = 100;
  state.plane.altitude = mission.cruiseAltitude;
  state.plane.fuel = mission.startFuel;
  state.plane.position = 0;
  state.plane.bombsAboard = true;

  state.stations = {};
  for (const s of STATIONS) state.stations[s.id] = { ammo: mission.startAmmoPerStation };
  state.activeStation = 'nose';

  state.fighters.length = 0;
  state.flak.length = 0;
  state.tracers.length = 0;
  state.kills = 0;
  state.fireCooldown = 0;

  state.decision = { triggered: false, resolved: false, choice: null };
  state.lowAltitude = false;
  state.bomb = null;
  state.result = { won: false, score: 0, breakdown: null };
  state.weightFactor = 1;

  // Per-mission spawn bookkeeping (which waves have fired, pending spawns).
  state._wavesFired = new Set();
  state._spawnQueue = [];
}

export function totalAmmo(state) {
  let n = 0;
  for (const id in state.stations) n += state.stations[id].ammo;
  return n;
}
