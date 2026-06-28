// Entry point: wire viewport + input + state, then run the loop.

import { createViewport } from './viewport.js';
import { createInput, spaceHeld } from './input.js';
import { createGameState, PHASE } from './state.js';
import { startLoop } from './loop.js';
import { layoutButtons, hitButton } from './ui.js';
import { update } from './phases.js';
import { drawCruise, drawBombRun } from './render/world.js';
import { drawHUD } from './render/hud.js';
import { drawBriefing, drawDecision, drawResults, drawButtons, drawRotatePrompt } from './render/screens.js';

const canvas = document.getElementById('game');
const { ctx, vp } = createViewport(canvas);
const input = createInput(canvas);
const state = createGameState(0);

// Debug handle (harmless): lets tooling/tests inspect live state.
window.b17 = { state, vp };

function inRect(r, p) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Turn raw pointer/key input into a per-frame intent for the phase machine.
function resolveInput() {
  // Discrete taps -> button presses (ignore the hold-to-fire button here).
  let tappedButton = null;
  let tap;
  while ((tap = input.tapQueue.shift())) {
    const b = hitButton(state.ui.buttons, tap.x, tap.y);
    if (b && !b.fire) tappedButton = b.id;
  }

  const keyStations = input.keyStationQueue.splice(0);

  // Firing: space, a finger held on the Fire button, or mouse held in the view.
  let firing = spaceHeld(input);
  for (const p of input.pointers.values()) {
    if (!p.down) continue;
    if (inRect(state.ui.fireRect, p)) firing = true;
    else if (p.type === 'mouse' && !hitButton(state.ui.buttons, p.x, p.y)) firing = true;
  }

  // Aim: latest pointer over open world (not on any control).
  for (const p of input.pointers.values()) {
    const onControl = hitButton(state.ui.buttons, p.x, p.y);
    if (onControl) continue;
    if (p.down || p.type === 'mouse') {
      state.aim.x = p.x;
      state.aim.y = p.y;
      state.aim.has = true;
    }
  }

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
      drawCruise(ctx, state, vp);
      drawHUD(ctx, state, vp);
      break;
    case PHASE.DECISION:
      drawCruise(ctx, state, vp);
      drawHUD(ctx, state, vp);
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
