// The single mutable game-state object. Every system is a function of (state).

import { STATIONS } from './stations.js';
import { getMission } from './data/missions.js';
import { DAMAGE } from './config.js';

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

    // Airframe systems (damage model). engineFire[i] true while that engine burns.
    systems: { engines: [true, true, true, true], engineFire: [false, false, false, false], fuelLeak: 0 },

    // Pilot controls.
    throttle: 1.0,
    evade: { active: 0, cooldown: 0 },
    brace: 0,

    // Crew radio feed + one-shot warning flags.
    radio: [],
    warned: { fuel: false, hull: false, flak: false, target: false },

    // Per-station: ammo + battle damage.
    stations: {},
    activeStation: 'nose',
    weightFactor: 1,

    fighters: [],
    flak: [],
    tracers: [],        // player gunfire lines (transient)
    enemyTracers: [],   // incoming gunfire lines (transient)
    kills: 0,

    // Active-gun firing state.
    fireCooldown: 0,
    gunBloom: 0,        // transient spread bloom (px) from recoil/sustained fire
    muzzleFlash: 0,     // >0 briefly after each shot (foreground gun flash)

    // Feedback effects.
    shake: 0,
    hitFlash: 0,

    decision: { triggered: false, resolved: false, choice: null },
    lowAltitude: false,

    bomb: null,
    result: { won: false, score: 0, breakdown: null },

    crosshair: { x: 0, y: 0 },
    aim: { x: 0, y: 0, has: false },

    ui: { buttons: [], tappedButton: null, fireRect: null },
  };
  resetMission(state, missionIndex);
  return state;
}

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

  state.systems = { engines: Array(DAMAGE.engines).fill(true), engineFire: Array(DAMAGE.engines).fill(false), fuelLeak: 0 };
  state.throttle = 1.0;
  state.evade = { active: 0, cooldown: 0 };
  state.brace = 0;
  state.radio = [];
  state.warned = { fuel: false, hull: false, flak: false, target: false };

  state.stations = {};
  for (const s of STATIONS) {
    state.stations[s.id] = { ammo: mission.startAmmoPerStation, disabled: false, wounded: false };
  }
  state.activeStation = 'nose';

  state.fighters.length = 0;
  state.flak.length = 0;
  state.tracers.length = 0;
  state.enemyTracers.length = 0;
  state.kills = 0;
  state.fireCooldown = 0;
  state.gunBloom = 0;
  state.muzzleFlash = 0;
  state.shake = 0;
  state.hitFlash = 0;

  state.decision = { triggered: false, resolved: false, choice: null };
  state.lowAltitude = false;
  state.bomb = null;
  state.result = { won: false, score: 0, breakdown: null };
  state.weightFactor = 1;

  state._wavesFired = new Set();
  state._spawnQueue = [];
  state._cruiseClock = 0;
  state._flakTimer = 0;
}

export function totalAmmo(state) {
  let n = 0;
  for (const id in state.stations) n += state.stations[id].ammo;
  return n;
}

export function enginesOut(state) {
  return state.systems.engines.filter((e) => !e).length;
}
