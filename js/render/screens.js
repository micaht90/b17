// Full-screen overlay screens (briefing / decision / results / rotate prompt)
// and the generic rectangular-button renderer shared by every phase.

import { COLORS } from '../config.js';
import { drawShape, SHAPE_NAMES } from '../targets.js';
import { roundRect } from './world.js';
import { loadBest } from '../scoring.js';
import { totalAmmo } from '../state.js';

function fontPx(vp, frac, min) {
  return `${Math.max(min, vp.h * frac)}px "Courier New", monospace`;
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

function dimBackground(ctx, vp, alpha = 0.78) {
  ctx.fillStyle = `rgba(8,11,14,${alpha})`;
  ctx.fillRect(0, 0, vp.w, vp.h);
}

export function drawButtons(ctx, state, vp) {
  for (const b of state.ui.buttons) {
    if (b.shape !== 'rect') continue;
    ctx.fillStyle = b.primary ? COLORS.good : COLORS.panel;
    ctx.strokeStyle = b.primary ? '#0b0e11' : COLORS.panelEdge;
    ctx.lineWidth = 2;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = b.primary ? '#0b0e11' : COLORS.hud;
    ctx.font = `bold ${Math.max(15, b.h * 0.3)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + b.h * 0.1);
  }
  ctx.textAlign = 'left';
}

export function drawBriefing(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  dimBackground(ctx, vp, 0.95);
  const m = state.mission;

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.warn;
  ctx.font = `bold ${fontPx(vp, 0.06, 22)}`;
  ctx.fillText('MISSION BRIEFING', W / 2, H * 0.12);
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${fontPx(vp, 0.045, 18)}`;
  ctx.fillText(m.name, W / 2, H * 0.19);

  // Target illustration.
  const s = Math.min(H * 0.05, W * 0.05);
  drawShape(ctx, m.target.shape, W / 2, H * 0.36, s, COLORS.hud);
  ctx.fillStyle = COLORS.good;
  ctx.font = `bold ${fontPx(vp, 0.035, 15)}`;
  ctx.fillText(`TARGET: ${m.target.name}`, W / 2, H * 0.5);
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = fontPx(vp, 0.028, 13);
  ctx.fillText(m.target.description, W / 2, H * 0.555);

  // Briefing text.
  ctx.fillStyle = COLORS.hud;
  ctx.font = fontPx(vp, 0.028, 13);
  ctx.textAlign = 'left';
  const lh = Math.max(18, H * 0.04);
  wrapText(ctx, m.briefing, W * 0.18, H * 0.64, W * 0.64, lh);

  const best = loadBest();
  if (best > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.warn;
    ctx.font = fontPx(vp, 0.026, 12);
    ctx.fillText(`BEST SCORE: ${best.toLocaleString()}`, W / 2, H * 0.86);
  }
  ctx.textAlign = 'left';
  drawButtons(ctx, state, vp);
}

export function drawDecision(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  dimBackground(ctx, vp, 0.7);

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.bad;
  ctx.font = `bold ${fontPx(vp, 0.06, 22)}`;
  ctx.fillText('LOSING ALTITUDE!', W / 2, H * 0.2);
  ctx.fillStyle = COLORS.hud;
  ctx.font = fontPx(vp, 0.03, 14);
  ctx.fillText('The Fortress is too heavy to clear the flak belt. Lighten her — choose:',
    W / 2, H * 0.3);
  ctx.font = fontPx(vp, 0.028, 13);
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(`Fuel ${Math.round(state.plane.fuel)}%   ·   Ammo aboard ${totalAmmo(state)} rounds`,
    W / 2, H * 0.37);

  drawButtons(ctx, state, vp);

  // Per-choice tradeoff captions under each button.
  const caps = {
    dump_fuel: 'Climb back — but a thin fuel reserve',
    jettison_ammo: 'Climb back — but almost no ammo left',
    press_on: 'Keep everything — cross the flak LOW (double damage)',
  };
  ctx.font = fontPx(vp, 0.022, 11);
  ctx.fillStyle = COLORS.hudDim;
  for (const b of state.ui.buttons) {
    if (!caps[b.id]) continue;
    wrapText(ctx, caps[b.id], b.x + 4, b.y + b.h + Math.max(16, H * 0.04), b.w - 8, Math.max(14, H * 0.03));
  }
  ctx.textAlign = 'left';
}

export function drawResults(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  dimBackground(ctx, vp, 0.95);
  const r = state.result;

  ctx.textAlign = 'center';
  ctx.fillStyle = r.won ? COLORS.good : COLORS.bad;
  ctx.font = `bold ${fontPx(vp, 0.07, 24)}`;
  ctx.fillText(r.won ? 'MISSION COMPLETE' : 'FORTRESS LOST', W / 2, H * 0.16);

  ctx.fillStyle = r.targetHit ? COLORS.good : COLORS.warn;
  ctx.font = `bold ${fontPx(vp, 0.035, 15)}`;
  ctx.fillText(r.targetHit ? 'Target destroyed' : 'Target survived', W / 2, H * 0.24);

  // Breakdown.
  ctx.font = fontPx(vp, 0.03, 13);
  let y = H * 0.34;
  const lh = Math.max(20, H * 0.05);
  const cxL = W * 0.3, cxR = W * 0.7;
  for (const row of r.breakdown) {
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, cxL, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = row.value > 0 ? COLORS.good : COLORS.hudDim;
    ctx.fillText(row.value > 0 ? `+${row.value.toLocaleString()}` : '0', cxR, y);
    y += lh;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.warn;
  ctx.font = `bold ${fontPx(vp, 0.05, 18)}`;
  ctx.fillText(`SCORE: ${r.score.toLocaleString()}`, W / 2, y + H * 0.04);
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = fontPx(vp, 0.026, 12);
  ctx.fillText(`Best: ${loadBest().toLocaleString()}`, W / 2, y + H * 0.09);

  ctx.textAlign = 'left';
  drawButtons(ctx, state, vp);
}

export function drawRotatePrompt(ctx, vp) {
  const W = vp.w, H = vp.h;
  ctx.fillStyle = '#0b0e11';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.42);
  ctx.strokeStyle = COLORS.hud;
  ctx.lineWidth = 4;
  roundRect(ctx, -28, -44, 56, 88, 8);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COLORS.hud;
  ctx.textAlign = 'center';
  ctx.font = `bold ${fontPx(vp, 0.05, 18)}`;
  ctx.fillText('Rotate to landscape', W / 2, H * 0.62);
  ctx.font = fontPx(vp, 0.03, 13);
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('Hold your phone sideways to fly the Fortress', W / 2, H * 0.68);
  ctx.textAlign = 'left';
}
