// Touch-first input. Each pointer is given a fixed ROLE at touch-down
// (button / fire / aim) so a finger on the Fire button can never be mistaken
// for an aim drag. Touch aiming is RELATIVE (trackpad-style) so the finger
// never has to cover the target; mouse aiming stays absolute.

import { KEYS } from './config.js';
import { hitButton } from './ui.js';

export function createInput(canvas) {
  // id -> { x, y, px, py, down, type, role, seeded }
  const pointers = new Map();
  const keys = new Set();
  const tapQueue = [];        // button ids pressed this frame
  const keyStationQueue = [];

  // main.js sets this so we can classify a touch the instant it lands.
  let getButtons = () => [];
  function setButtons(fn) { getButtons = fn; }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    const b = hitButton(getButtons(), p.x, p.y);
    let role = 'aim';
    if (b) {
      if (b.fire) role = 'fire';
      else { role = 'button'; tapQueue.push(b.id); }
    }
    pointers.set(e.pointerId, { x: p.x, y: p.y, px: p.x, py: p.y, down: true, type: e.pointerType, role, seeded: false });
    if (e.pointerType !== 'mouse') e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    const ptr = pointers.get(e.pointerId);
    if (ptr) { ptr.x = p.x; ptr.y = p.y; }
    else if (e.pointerType === 'mouse') {
      pointers.set(e.pointerId, { x: p.x, y: p.y, px: p.x, py: p.y, down: false, type: 'mouse', role: 'aim', seeded: false });
    }
  }, { passive: false });

  function release(e) {
    const ptr = pointers.get(e.pointerId);
    if (!ptr) return;
    if (e.pointerType === 'mouse') {
      // Keep the mouse as a hover-aim pointer once the click ends.
      ptr.down = false;
      ptr.role = 'aim';
      ptr.seeded = false;
    } else {
      pointers.delete(e.pointerId);
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') pointers.delete(e.pointerId); });

  window.addEventListener('keydown', (e) => {
    keys.add(e.key);
    if (KEYS.stations[e.key]) keyStationQueue.push(KEYS.stations[e.key]);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  return { pointers, keys, tapQueue, keyStationQueue, setButtons };
}

export function spaceHeld(input) {
  for (const k of KEYS.fire) if (input.keys.has(k)) return true;
  return false;
}
