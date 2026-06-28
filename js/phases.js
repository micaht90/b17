// Phase state machine. Each frame main.js resolves input into `frame`
// ({ firing, tappedButton, keyStations }) and calls update().

import { PHASE, resetMission } from './state.js';
import { GAME } from './config.js';
import { updateEnemies } from './enemies.js';
import { updateFlak } from './flak.js';
import { updateCrosshair, updateFiring } from './combat.js';
import { updateResources, speedFactor, dumpFuel, jettisonAmmo, pressOn } from './resources.js';
import { initBombRun, updateBombRun, dropBomb } from './bombing.js';
import { computeScore, saveBest } from './scoring.js';

function enterCruise(state) {
  state.phase = PHASE.CRUISE;
  state.phaseTime = 0;
  state.plane.altitude = state.mission.cruiseAltitude;
}

function enterDecision(state) {
  state.decision.triggered = true;
  state.plane.altitude = state.mission.minAltitudeToProceed - 1500;
  state.phase = PHASE.DECISION;
  state.phaseTime = 0;
}

function enterBombRun(state, vp) {
  state.phase = PHASE.BOMBRUN;
  state.phaseTime = 0;
  state.fighters.length = 0;
  state.flak.length = 0;
  state.tracers.length = 0;
  state.enemyTracers.length = 0;
  initBombRun(state, vp);
}

function enterResults(state) {
  state.result = computeScore(state);
  saveBest(state.result.score);
  state.phase = PHASE.RESULTS;
  state.phaseTime = 0;
}

function decayEffects(state, dt) {
  state.shake = Math.max(0, state.shake - dt * 2.2);
  state.hitFlash = Math.max(0, state.hitFlash - dt * 1.8);
  if (state.lastHit) {
    state.lastHit.t -= dt;
    if (state.lastHit.t <= 0) state.lastHit = null;
  }
}

function updateCruise(state, vp, dt, frame) {
  if (frame.tappedButton && frame.tappedButton.startsWith('station:')) {
    state.activeStation = frame.tappedButton.slice('station:'.length);
  }
  for (const id of frame.keyStations) state.activeStation = id;

  updateCrosshair(state, vp, dt);
  updateFiring(state, vp, dt, frame.firing);
  decayEffects(state, dt);

  state.plane.position = Math.min(
    state.mission.distance,
    state.plane.position + GAME.cruiseSpeed * speedFactor(state) * dt,
  );

  updateResources(state, dt);
  updateEnemies(state, dt);
  updateFlak(state, dt);

  if (state.plane.fuel <= 0) state.plane.health = 0;

  if (state.plane.health <= 0) {
    enterResults(state);
    return;
  }

  if (!state.decision.triggered && state.plane.position >= state.mission.decisionTrigger.at) {
    enterDecision(state);
    return;
  }

  if (state.plane.position >= state.mission.distance) {
    enterBombRun(state, vp);
  }
}

function updateDecision(state, frame) {
  let resolved = false;
  if (frame.tappedButton === 'dump_fuel') { dumpFuel(state); resolved = true; }
  else if (frame.tappedButton === 'jettison_ammo') { jettisonAmmo(state); resolved = true; }
  else if (frame.tappedButton === 'press_on') { pressOn(state); resolved = true; }
  if (resolved) enterCruise(state);
}

function updateBomb(state, vp, dt, frame) {
  if (frame.tappedButton === 'drop') dropBomb(state, vp);
  if (updateBombRun(state, vp, dt)) enterResults(state);
}

export function update(state, vp, dt, frame) {
  state.phaseTime += dt;
  switch (state.phase) {
    case PHASE.BRIEFING:
      if (frame.tappedButton === 'takeoff') enterCruise(state);
      break;
    case PHASE.CRUISE:
      updateCruise(state, vp, dt, frame);
      break;
    case PHASE.DECISION:
      updateDecision(state, frame);
      break;
    case PHASE.BOMBRUN:
      updateBomb(state, vp, dt, frame);
      break;
    case PHASE.RESULTS:
      if (frame.tappedButton === 'again') resetMission(state);
      break;
  }
}
