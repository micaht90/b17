// Entry point: wire viewport + input + state, then run the loop.

import { createViewport } from './viewport.js';
import { createInput, spaceHeld } from './input.js';
import { createGameState, PHASE } from './state.js';
import { startLoop } from './loop.js';
import { layoutButtons } from './ui.js';
import { AIM } from './config.js';
import { update } from './phases.js';
import { drawCruise, drawBombRun } from './render/world.js';
import { drawHUD } from './render/hud.js';
import { drawCockpit } from './render/cockpit.js';
import { drawBriefing, drawDecision, drawResults, drawButtons, drawRotatePrompt } from './render/screens.js';

const canvas = document.getElementById('game');
const { ctx, vp } = createViewport(canvas);
const input = createInput(canvas);
const state = createGameState(0);

// Debug handle (harmless): lets tooling/tests inspect live state.
window.b17 = { state, vp };

// Let input classify a touch against the current button layout at touch-down.
input.setButtons(() => state.ui.buttons);

// Turn raw pointer/key input into a per-frame intent for the phase machine.
// Pointer ROLES are fixed at touch-down (see input.js): a finger on the Fire
// button never moves the aim, and touch aiming is RELATIVE so the finger
// doesn't have to cover the target.
function resolveInput() {
  let tappedButton = null;
  let id;
  while ((id = input.tapQueue.shift())) tappedButton = id;

  const keyStations = input.keyStationQueue.splice(0);

  let firing = spaceHeld(input);
  let touchAim = null, mouseAim = null;
  for (const p of input.pointers.values()) {
    if (p.role === 'fire' && p.down) firing = true;
    if (p.role === 'aim') {
      if (p.type === 'mouse') { mouseAim = p; if (p.down) firing = true; }
      else if (p.down) touchAim = p;
    }
  }
  // An active touch always wins over a hovering mouse.
  const aimPtr = touchAim || mouseAim;

  if (aimPtr) {
    if (!aimPtr.seeded) {
      // Continue from where the crosshair already is — no jump to the finger.
      aimPtr.seeded = true;
      aimPtr.px = aimPtr.x; aimPtr.py = aimPtr.y;
      state.aim.x = state.crosshair.x;
      state.aim.y = state.crosshair.y;
    }
    if (aimPtr.type === 'mouse') {
      state.aim.x = aimPtr.x;
      state.aim.y = aimPtr.y;
    } else {
      state.aim.x += (aimPtr.x - aimPtr.px) * AIM.touchSensitivity;
      state.aim.y += (aimPtr.y - aimPtr.py) * AIM.touchSensitivity;
    }
    state.aim.has = true;
    state.aim.x = Math.max(0, Math.min(vp.w, state.aim.x));
    state.aim.y = Math.max(0, Math.min(vp.h, state.aim.y));
  }

  // Record this frame's positions for next-frame relative deltas.
  for (const p of input.pointers.values()) { p.px = p.x; p.py = p.y; }

  return { tappedButton, keyStations, firing };
}

function render() {
  ctx.fillStyle = '#0b0e11';
  ctx.fillRect(0, 0, vp.w, vp.h);

  switch (state.phase) {
    case PHASE.BRIEFING:
      drawBriefing(ctx, state, vp);
      break;
    case PHASE.CRUISE:
      if (state.activeStation === 'pilot') drawCockpit(ctx, state, vp);
      else { drawCruise(ctx, state, vp); drawHUD(ctx, state, vp); }
      break;
    case PHASE.DECISION:
      if (state.activeStation === 'pilot') drawCockpit(ctx, state, vp);
      else { drawCruise(ctx, state, vp); drawHUD(ctx, state, vp); }
      drawDecision(ctx, state, vp);
      break;
    case PHASE.BOMBRUN:
      drawBombRun(ctx, state, vp);
      drawButtons(ctx, state, vp);
      break;
    case PHASE.RESULTS:
      drawResults(ctx, state, vp);
      break;
  }
}

startLoop((dt) => {
  if (vp.isPortrait) {
    drawRotatePrompt(ctx, vp);
    return; // pause in portrait
  }
  layoutButtons(state, vp);
  const frame = resolveInput();
  update(state, vp, dt, frame);
  render();
});
