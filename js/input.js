// Touch-first input. Tracks live pointers + keyboard and exposes raw data;
// main.js resolves it against the current button layout each frame.

import { KEYS } from './config.js';

export function createInput(canvas) {
  const pointers = new Map(); // id -> { x, y, down, type }
  const keys = new Set();
  const tapQueue = [];        // {x,y} for each pointerdown (button hit-testing)
  const keyStationQueue = []; // station ids from number keys

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, down: true, type: e.pointerType });
    tapQueue.push({ x: p.x, y: p.y });
    if (e.pointerType !== 'mouse') e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    const existing = pointers.get(e.pointerId);
    if (existing) {
      existing.x = p.x;
      existing.y = p.y;
    } else if (e.pointerType === 'mouse') {
      pointers.set(e.pointerId, { x: p.x, y: p.y, down: false, type: 'mouse' });
    }
  }, { passive: false });

  function release(e) {
    const ptr = pointers.get(e.pointerId);
    if (!ptr) return;
    if (e.pointerType === 'mouse') {
      ptr.down = false; // keep mouse as a hover pointer
    } else {
      pointers.delete(e.pointerId);
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') pointers.delete(e.pointerId);
  });

  window.addEventListener('keydown', (e) => {
    keys.add(e.key);
    if (KEYS.stations[e.key]) keyStationQueue.push(KEYS.stations[e.key]);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  return { pointers, keys, tapQueue, keyStationQueue };
}

export function spaceHeld(input) {
  for (const k of KEYS.fire) if (input.keys.has(k)) return true;
  return false;
}
