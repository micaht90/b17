// HUD overlay during cruise: gauges, systems status, the tappable plane
// diagram (threat flash + gun damage), the active gun's heat, and Fire button.

import { COLORS, GUN } from '../config.js';
import { STATIONS, STATION_BY_ID } from '../stations.js';
import { arcsUnderThreat } from '../enemies.js';
import { stationDiagramLayout, fireButtonLayout } from '../ui.js';
import { roundRect } from './world.js';
import { enginesOut } from '../state.js';

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
  const bh = Math.max(16, H * 0.034);
  const m = state.mission;

  // Top-left panel: hull / fuel / altitude / systems.
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, pad, pad, bw + 12, bh * 4 + 20, 8); ctx.fill();
  const hullCol = state.plane.health > 40 ? COLORS.good : state.plane.health > 20 ? COLORS.warn : COLORS.bad;
  bar(ctx, pad + 6, pad + 6, bw, bh, state.plane.health / 100, hullCol, `HULL ${Math.round(state.plane.health)}%`);
  const fuelCol = state.plane.fuel > 30 ? COLORS.good : COLORS.warn;
  const leak = state.systems.fuelLeak > 0 ? ' LEAK' : '';
  bar(ctx, pad + 6, pad + 6 + bh + 4, bw, bh, state.plane.fuel / 100, fuelCol, `FUEL ${Math.round(state.plane.fuel)}%${leak}`);
  const lowAlt = state.plane.altitude < m.minAltitudeToProceed;
  ctx.fillStyle = lowAlt ? COLORS.bad : COLORS.hud;
  ctx.font = `bold ${bh * 0.8}px "Courier New", monospace`;
  ctx.fillText(`ALT ${Math.round(state.plane.altitude).toLocaleString()}ft${lowAlt ? ' LOW!' : ''}`,
    pad + 6, pad + 6 + (bh + 4) * 2 + bh * 0.78);

  // Engines row.
  const ey = pad + 6 + (bh + 4) * 3 + bh * 0.55;
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('ENG', pad + 6, ey + bh * 0.25);
  const out = state.systems.engines;
  const ex = pad + 6 + bw * 0.28;
  const es = bh * 0.7;
  for (let i = 0; i < out.length; i++) {
    ctx.fillStyle = out[i] ? COLORS.good : COLORS.bad;
    roundRect(ctx, ex + i * (es + 5), ey - es * 0.5, es, es, 3); ctx.fill();
  }

  // Top-right panel: progress / kills.
  const rx = W - bw - 12 - pad;
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, rx - 6, pad, bw + 12, bh * 2 + 12, 8); ctx.fill();
  bar(ctx, rx, pad + 6, bw, bh, state.plane.position / m.distance, COLORS.hud,
    `TARGET ${Math.round((state.plane.position / m.distance) * 100)}%`);
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${bh * 0.8}px "Courier New", monospace`;
  ctx.fillText(`FIGHTERS DOWNED: ${state.kills}`, rx, pad + 6 + bh + 4 + bh * 0.78);

  drawPlaneDiagram(ctx, state, vp);
  drawFireButton(ctx, state, vp);
}

function drawPlaneDiagram(ctx, state, vp) {
  const dia = stationDiagramLayout(vp);
  const threats = arcsUnderThreat(state);
  const pulse = (Math.sin(performance.now() / 150) + 1) / 2;

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
    const st = state.stations[s.id];
    const active = state.activeStation === s.id;
    const threatened = threats.has(s.arc);
    let fill = COLORS.panel;
    if (active) fill = COLORS.good;
    else if (st.disabled) fill = 'rgba(60,60,64,0.85)';
    else if (threatened) fill = `rgba(224,88,74,${0.45 + 0.55 * pulse})`;
    ctx.fillStyle = fill;
    ctx.strokeStyle = active ? COLORS.hud : COLORS.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, dia.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if (st.disabled) {
      ctx.strokeStyle = COLORS.bad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - dia.r * 0.5, y - dia.r * 0.5); ctx.lineTo(x + dia.r * 0.5, y + dia.r * 0.5);
      ctx.moveTo(x + dia.r * 0.5, y - dia.r * 0.5); ctx.lineTo(x - dia.r * 0.5, y + dia.r * 0.5);
      ctx.stroke();
    } else {
      ctx.fillStyle = active ? '#0b0e11' : (st.wounded ? COLORS.warn : COLORS.hud);
      ctx.fillText(s.short, x, y + dia.r * 0.32);
      // heat ring
      if (st.heat > 0.05) {
        ctx.strokeStyle = st.jammed ? COLORS.bad : COLORS.heat;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, dia.r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, st.heat));
        ctx.stroke();
      }
    }
  }
  ctx.textAlign = 'left';
}

function drawFireButton(ctx, state, vp) {
  const fb = fireButtonLayout(vp);
  const st = state.stations[state.activeStation];
  const disabled = st.disabled;
  const jam = st.jammed;

  ctx.fillStyle = disabled ? 'rgba(70,70,74,0.8)' : jam ? 'rgba(120,70,60,0.85)' : (st.ammo > 0 ? COLORS.fire : 'rgba(80,80,80,0.7)');
  ctx.strokeStyle = jam ? COLORS.bad : COLORS.fireHot;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(fb.cx, fb.cy, fb.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Heat ring around the button.
  ctx.strokeStyle = jam ? COLORS.bad : COLORS.heat;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(fb.cx, fb.cy, fb.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, st.heat));
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `bold ${fb.r * 0.3}px "Courier New", monospace`;
  ctx.fillText(disabled ? 'OUT' : jam ? 'JAM' : 'FIRE', fb.cx, fb.cy - fb.r * 0.02);
  ctx.font = `bold ${fb.r * 0.24}px "Courier New", monospace`;
  ctx.fillText(`${st.ammo}`, fb.cx, fb.cy + fb.r * 0.42);
  ctx.textAlign = 'left';
}
