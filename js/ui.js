// Per-frame button layout for the current phase. The same list drives both
// rendering (hud/screens) and input hit-testing, so they never disagree.

import { PHASE } from './state.js';
import { STATIONS } from './stations.js';

function rectBtn(id, label, x, y, w, h, extra = {}) {
  return { id, label, x, y, w, h, shape: 'rect', ...extra };
}
function circBtn(id, label, cx, cy, r, extra = {}) {
  return { id, label, cx, cy, r, x: cx - r, y: cy - r, w: r * 2, h: r * 2, shape: 'circle', ...extra };
}

// Top-view plane diagram station positions (also used by the HUD renderer).
export function stationDiagramLayout(vp) {
  const cx = Math.max(vp.w * 0.13, 78);
  const cy = vp.h * 0.58;
  const L = Math.min(vp.h * 0.2, vp.w * 0.13);
  const r = Math.max(19, Math.min(vp.h, vp.w) * 0.045);
  const pos = {
    nose: [cx, cy - L],
    top: [cx, cy - L * 0.35],
    ball: [cx, cy + L * 0.18],
    tail: [cx, cy + L],
    waistL: [cx - L * 0.62, cy + L * 0.02],
    waistR: [cx + L * 0.62, cy + L * 0.02],
  };
  return { cx, cy, L, r, pos };
}

export function fireButtonLayout(vp) {
  const r = Math.max(36, Math.min(vp.h, vp.w) * 0.085);
  return { cx: vp.w - r * 1.25, cy: vp.h - r * 1.3, r };
}

export function layoutButtons(state, vp) {
  const list = [];
  const W = vp.w;
  const H = vp.h;

  switch (state.phase) {
    case PHASE.BRIEFING: {
      const w = Math.min(W * 0.46, 360);
      const h = Math.max(56, H * 0.12);
      list.push(rectBtn('takeoff', 'TAKE OFF', W / 2 - w / 2, H - h - H * 0.06, w, h, { primary: true }));
      break;
    }

    case PHASE.CRUISE: {
      const dia = stationDiagramLayout(vp);
      for (const s of STATIONS) {
        const [x, y] = dia.pos[s.id];
        list.push(circBtn('station:' + s.id, s.short, x, y, dia.r, { station: s.id }));
      }
      const fb = fireButtonLayout(vp);
      list.push(circBtn('fire', 'FIRE', fb.cx, fb.cy, fb.r, { fire: true }));
      state.ui.fireRect = { x: fb.cx - fb.r, y: fb.cy - fb.r, w: fb.r * 2, h: fb.r * 2 };
      break;
    }

    case PHASE.DECISION: {
      const w = Math.min(W * 0.27, 280);
      const h = Math.max(80, H * 0.2);
      const gap = W * 0.03;
      const total = w * 3 + gap * 2;
      const x0 = W / 2 - total / 2;
      const y = H * 0.56;
      list.push(rectBtn('dump_fuel', 'DUMP FUEL', x0, y, w, h));
      list.push(rectBtn('jettison_ammo', 'JETTISON AMMO', x0 + (w + gap), y, w, h));
      list.push(rectBtn('press_on', 'PRESS ON', x0 + (w + gap) * 2, y, w, h));
      break;
    }

    case PHASE.BOMBRUN: {
      if (state.bomb && !state.bomb.dropped) {
        const w = Math.min(W * 0.4, 320);
        const h = Math.max(60, H * 0.13);
        list.push(rectBtn('drop', 'DROP BOMBS', W / 2 - w / 2, H - h - H * 0.05, w, h, { primary: true }));
      }
      break;
    }

    case PHASE.RESULTS: {
      const w = Math.min(W * 0.4, 320);
      const h = Math.max(56, H * 0.12);
      list.push(rectBtn('again', 'FLY AGAIN', W / 2 - w / 2, H - h - H * 0.06, w, h, { primary: true }));
      break;
    }
  }

  state.ui.buttons = list;
  if (state.phase !== PHASE.CRUISE) state.ui.fireRect = null;
  return list;
}

export function hitButton(buttons, x, y) {
  // Topmost-last; iterate in reverse so later buttons win overlaps.
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (b.shape === 'circle') {
      if (Math.hypot(x - b.cx, y - b.cy) <= b.r) return b;
    } else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return b;
    }
  }
  return null;
}
