// The bombing run: a top-down bombsight with the real target and decoys
// scrolling past. The player must recognize the briefed target and tap Drop.

import { GAME } from './config.js';

export function bombsightY(vp) {
  return vp.h * 0.46;
}

export function initBombRun(state, vp) {
  const cfg = state.mission.bombRun;
  const count = cfg.buildingCount || 5;
  const targetIndex = 1 + Math.floor(Math.random() * (count - 2)); // not first/last
  const decoys = cfg.decoyShapes.slice();

  const buildings = [];
  let d = 0;
  for (let i = 0; i < count; i++) {
    const isTarget = i === targetIndex;
    const shape = isTarget ? state.mission.target.shape : decoys[i % decoys.length];
    buildings.push({
      shape,
      isTarget,
      // px offset below the bombsight at scroll=0; later ones are further out.
      pos: 320 + i * GAME.buildingSpacing,
      lane: (Math.random() * 2 - 1) * 0.42, // horizontal placement on the ground
    });
    d = buildings[i].pos;
  }

  state.bomb = {
    buildings,
    scroll: 0,
    speed: cfg.scrollSpeed || GAME.bombScrollSpeed,
    dropWindowRadius: cfg.dropWindowRadius || 46,
    dropped: false,
    done: false,
    endTimer: 0,
    lastBuildingPos: d,
    result: null,
  };
}

// Current vertical screen position of a building.
export function buildingScreenY(state, b, vp) {
  return bombsightY(vp) + (b.pos - state.bomb.scroll);
}

export function dropBomb(state, vp) {
  const bomb = state.bomb;
  if (!bomb || bomb.dropped) return;
  bomb.dropped = true;

  const cy = bombsightY(vp);
  let nearest = null;
  let nearestDist = Infinity;
  for (const b of bomb.buildings) {
    const dist = Math.abs(buildingScreenY(state, b, vp) - cy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = b;
    }
  }

  const hit = !!nearest && nearest.isTarget && nearestDist <= bomb.dropWindowRadius;
  const accuracy = hit ? Math.max(0, 1 - nearestDist / bomb.dropWindowRadius) : 0;
  bomb.result = {
    hit,
    accuracy,
    onWrongTarget: !!nearest && !nearest.isTarget && nearestDist <= bomb.dropWindowRadius,
    droppedBuilding: nearest,
  };
  state.plane.bombsAboard = false;
}

// Advance the run. Returns true once the run is completely finished.
export function updateBombRun(state, vp, dt) {
  const bomb = state.bomb;
  if (!bomb) return false;

  if (!bomb.dropped) {
    bomb.scroll += bomb.speed * dt;
    // If everything scrolled past the sight, that's a miss (never dropped).
    if (bomb.scroll > bomb.lastBuildingPos + 200) {
      bomb.dropped = true;
      bomb.result = { hit: false, accuracy: 0, missed: true, droppedBuilding: null };
      state.plane.bombsAboard = false;
    }
  } else {
    bomb.endTimer += dt;
    if (bomb.endTimer >= 1.6) {
      bomb.done = true;
      return true;
    }
  }
  return false;
}
