// HUD overlay during cruise: gauges, the tappable plane diagram (with threat
// flashes), the active-station ammo, and the Fire button.

import { COLORS } from '../config.js';
import { STATIONS, STATION_BY_ID } from '../stations.js';
import { arcsUnderThreat } from '../enemies.js';
import { stationDiagramLayout, fireButtonLayout } from '../ui.js';
import { roundRect } from './world.js';

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * Math.max(0, Math.min(1, frac)), h, 4); ctx.fill();
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${h * 0.78}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 6, y + h * 0.78);
}

export function drawHUD(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const pad = Math.max(8, W * 0.012);
  const bw = Math.max(150, W * 0.2);
  const bh = Math.max(16, H * 0.035);
  const m = state.mission;

  // Top-left: hull / fuel / altitude.
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, pad, pad, bw + 12, bh * 3 + 16, 8); ctx.fill();
  const hullCol = state.plane.health > 40 ? COLORS.good : state.plane.health > 20 ? COLORS.warn : COLORS.bad;
  bar(ctx, pad + 6, pad + 6, bw, bh, state.plane.health / 100, hullCol, `HULL ${Math.round(state.plane.health)}%`);
  const fuelCol = state.plane.fuel > 30 ? COLORS.good : COLORS.warn;
  bar(ctx, pad + 6, pad + 6 + bh + 4, bw, bh, state.plane.fuel / 100, fuelCol, `FUEL ${Math.round(state.plane.fuel)}%`);
  const lowAlt = state.plane.altitude < m.minAltitudeToProceed;
  ctx.fillStyle = lowAlt ? COLORS.bad : COLORS.hud;
  ctx.font = `bold ${bh * 0.82}px "Courier New", monospace`;
  ctx.fillText(`ALT ${Math.round(state.plane.altitude).toLocaleString()} ft${lowAlt ? '  LOW!' : ''}`,
    pad + 6, pad + 6 + (bh + 4) * 2 + bh * 0.78);

  // Top-right: progress / kills.
  const rx = W - bw - 12 - pad;
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, rx - 6, pad, bw + 12, bh * 2 + 12, 8); ctx.fill();
  bar(ctx, rx, pad + 6, bw, bh, state.plane.position / m.distance, COLORS.hud,
    `TARGET ${Math.round((state.plane.position / m.distance) * 100)}%`);
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${bh * 0.82}px "Courier New", monospace`;
  ctx.fillText(`FIGHTERS DOWNED: ${state.kills}`, rx, pad + 6 + bh + 4 + bh * 0.78);

  drawPlaneDiagram(ctx, state, vp);
  drawFireButton(ctx, state, vp);
}

function drawPlaneDiagram(ctx, state, vp) {
  const dia = stationDiagramLayout(vp);
  const threats = arcsUnderThreat(state);
  const pulse = (Math.sin(performance.now() / 150) + 1) / 2;

  // Fuselage + wings outline.
  ctx.strokeStyle = COLORS.hudDim;
  ctx.lineWidth = Math.max(6, dia.r * 0.7);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(dia.cx, dia.cy - dia.L);
  ctx.lineTo(dia.cx, dia.cy + dia.L);
  ctx.moveTo(dia.cx - dia.L * 0.62, dia.cy);
  ctx.lineTo(dia.cx + dia.L * 0.62, dia.cy);
  ctx.stroke();

  ctx.font = `bold ${Math.max(9, dia.r * 0.5)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  for (const s of STATIONS) {
    const [x, y] = dia.pos[s.id];
    const active = state.activeStation === s.id;
    const threatened = threats.has(s.arc);
    let fill = COLORS.panel;
    if (active) fill = COLORS.good;
    else if (threatened) fill = `rgba(224,88,74,${0.45 + 0.55 * pulse})`;
    ctx.fillStyle = fill;
    ctx.strokeStyle = active ? COLORS.hud : COLORS.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, dia.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#0b0e11' : COLORS.hud;
    ctx.fillText(s.short, x, y + dia.r * 0.32);
  }
  ctx.textAlign = 'left';
}

function drawFireButton(ctx, state, vp) {
  const fb = fireButtonLayout(vp);
  const ammo = state.stations[state.activeStation].ammo;
  ctx.fillStyle = ammo > 0 ? COLORS.fire : 'rgba(80,80,80,0.7)';
  ctx.strokeStyle = COLORS.fireHot;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fb.cx, fb.cy, fb.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `bold ${fb.r * 0.32}px "Courier New", monospace`;
  ctx.fillText('FIRE', fb.cx, fb.cy - fb.r * 0.02);
  ctx.font = `bold ${fb.r * 0.24}px "Courier New", monospace`;
  ctx.fillText(`${ammo}`, fb.cx, fb.cy + fb.r * 0.42);
  ctx.textAlign = 'left';
}
