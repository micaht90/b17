// Per-frame button layout for the current phase. The same list drives both
// rendering (hud/screens/cockpit) and input hit-testing, so they never disagree.

import { PHASE } from './state.js';
import { STATIONS } from './stations.js';
import { inFlakZone } from './flak.js';
import { hasFire } from './controls.js';

function rectBtn(id, label, x, y, w, h, extra = {}) {
  return { id, label, x, y, w, h, shape: 'rect', ...extra };
}
function circBtn(id, label, cx, cy, r, extra = {}) {
  return { id, label, cx, cy, r, x: cx - r, y: cy - r, w: r * 2, h: r * 2, shape: 'circle', ...extra };
}

export function stationDiagramLayout(vp) {
  const cx = Math.max(vp.w * 0.13, 78);
  const cy = vp.h * 0.55;
  const L = Math.min(vp.h * 0.19, vp.w * 0.12);
  const r = Math.max(18, Math.min(vp.h, vp.w) * 0.043);
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

function layoutCockpitControls(state, vp, list) {
  const W = vp.w, H = vp.h;
  const pad = Math.max(8, W * 0.012);
  const bw = Math.min(W * 0.23, 250);
  const h = Math.max(44, H * 0.11);
  const gap = H * 0.022;
  const x = W - bw - pad;
  let y = H * 0.16;

  // Throttle as a two-button row.
  const thw = (bw - gap) / 2;
  list.push(rectBtn('throttle_down', 'THR –', x, y, thw, h, { ctrl: true }));
  list.push(rectBtn('throttle_up', 'THR +', x + thw + gap, y, thw, h, { ctrl: true }));
  y += h + gap;

  const inFlak = !!inFlakZone(state);
  if (inFlak) {
    const cooling = state.evade.cooldown > 0 || state.evade.active > 0;
    list.push(rectBtn('evade', state.evade.active > 0 ? 'CORKSCREW!' : 'EVADE', x, y, bw, h, { ctrl: true, alert: state.evade.active > 0, dim: cooling }));
    y += h + gap;
    list.push(rectBtn('brace', 'BRACE', x, y, bw, h, { ctrl: true, alert: state.brace > 0 }));
    y += h + gap;
  }
  if (hasFire(state)) {
    list.push(rectBtn('extinguish', 'EXTINGUISH', x, y, bw, h, { ctrl: true, alert: true }));
    y += h + gap;
  }
  if (state.systems.fuelLeak > 0) {
    list.push(rectBtn('seal', 'SEAL TANK', x, y, bw, h, { ctrl: true, alert: true }));
    y += h + gap;
  }
}

export function layoutButtons(state, vp) {
  const list = [];
  const W = vp.w, H = vp.h;

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
      // Pilot / cockpit switch, just below the diagram.
      const pw = dia.r * 3.4, ph = dia.r * 1.25;
      list.push(rectBtn('station:pilot', 'PILOT', dia.cx - pw / 2, dia.cy + dia.L + dia.r * 0.7, pw, ph,
        { station: 'pilot', pilot: true }));

      if (state.activeStation === 'pilot') {
        layoutCockpitControls(state, vp, list);
        state.ui.fireRect = null;
      } else {
        const fb = fireButtonLayout(vp);
        list.push(circBtn('fire', 'FIRE', fb.cx, fb.cy, fb.r, { fire: true }));
        state.ui.fireRect = { x: fb.cx - fb.r, y: fb.cy - fb.r, w: fb.r * 2, h: fb.r * 2 };
      }
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
      state.ui.fireRect = null;
      break;
    }

    case PHASE.BOMBRUN: {
      if (state.bomb && !state.bomb.dropped) {
        const w = Math.min(W * 0.4, 320);
        const h = Math.max(60, H * 0.13);
        list.push(rectBtn('drop', 'DROP BOMBS', W / 2 - w / 2, H - h - H * 0.05, w, h, { primary: true }));
      }
      state.ui.fireRect = null;
      break;
    }

    case PHASE.RESULTS: {
      const w = Math.min(W * 0.4, 320);
      const h = Math.max(56, H * 0.12);
      list.push(rectBtn('again', 'FLY AGAIN', W / 2 - w / 2, H - h - H * 0.06, w, h, { primary: true }));
      state.ui.fireRect = null;
      break;
    }
  }

  state.ui.buttons = list;
  return list;
}

export function hitButton(buttons, x, y) {
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
