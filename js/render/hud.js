// HUD overlay: gauges, systems, the tappable plane diagram (with threat flash
// and gun damage), the PILOT switch, the Fire button, and the radio feed.

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

export function drawGauges(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const pad = Math.max(8, W * 0.012);
  const bw = Math.max(150, W * 0.2);
  const bh = Math.max(16, H * 0.034);
  const m = state.mission;

  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, pad, pad, bw + 12, bh * 4 + 24, 8); ctx.fill();
  const hullCol = state.plane.health > 40 ? COLORS.good : state.plane.health > 20 ? COLORS.warn : COLORS.bad;
  bar(ctx, pad + 6, pad + 6, bw, bh, state.plane.health / 100, hullCol, `HULL ${Math.round(state.plane.health)}%`);
  const fuelCol = state.plane.fuel > 30 ? COLORS.good : COLORS.warn;
  const leak = state.systems.fuelLeak > 0 ? ' LEAK!' : '';
  bar(ctx, pad + 6, pad + 6 + bh + 4, bw, bh, state.plane.fuel / 100, fuelCol, `FUEL ${Math.round(state.plane.fuel)}%${leak}`);
  const lowAlt = state.plane.altitude < m.minAltitudeToProceed;
  ctx.fillStyle = lowAlt ? COLORS.bad : COLORS.hud;
  ctx.font = `bold ${bh * 0.8}px "Courier New", monospace`;
  ctx.fillText(`ALT ${Math.round(state.plane.altitude).toLocaleString()}ft  THR ${Math.round(state.throttle * 100)}%`,
    pad + 6, pad + 6 + (bh + 4) * 2 + bh * 0.78);

  // Engines with fire markers.
  const ey = pad + 6 + (bh + 4) * 3 + bh * 0.55;
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('ENG', pad + 6, ey + bh * 0.25);
  const ex = pad + 6 + bw * 0.28;
  const es = bh * 0.7;
  for (let i = 0; i < state.systems.engines.length; i++) {
    const fire = state.systems.engineFire[i];
    ctx.fillStyle = fire ? COLORS.fireHot : state.systems.engines[i] ? COLORS.good : COLORS.bad;
    roundRect(ctx, ex + i * (es + 5), ey - es * 0.5, es, es, 3); ctx.fill();
  }
}

export function drawProgress(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const pad = Math.max(8, W * 0.012);
  const bw = Math.max(150, W * 0.2);
  const bh = Math.max(16, H * 0.034);
  const m = state.mission;
  const rx = W - bw - 12 - pad;
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, rx - 6, pad, bw + 12, bh * 2 + 12, 8); ctx.fill();
  bar(ctx, rx, pad + 6, bw, bh, state.plane.position / m.distance, COLORS.hud,
    `TARGET ${Math.round((state.plane.position / m.distance) * 100)}%`);
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${bh * 0.8}px "Courier New", monospace`;
  ctx.fillText(`FIGHTERS DOWNED: ${state.kills}`, rx, pad + 6 + bh + 4 + bh * 0.78);
}

export function drawHUD(ctx, state, vp) {
  drawGauges(ctx, state, vp);
  drawProgress(ctx, state, vp);
  drawPlaneDiagram(ctx, state, vp);
  drawPilotButton(ctx, state, vp);
  if (state.activeStation !== 'pilot') drawFireButton(ctx, state, vp);
  drawRadio(ctx, state, vp);
}

export function drawPlaneDiagram(ctx, state, vp) {
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

export function drawPilotButton(ctx, state, vp) {
  const b = state.ui.buttons.find((x) => x.id === 'station:pilot');
  if (!b) return;
  const active = state.activeStation === 'pilot';
  ctx.fillStyle = active ? COLORS.good : COLORS.panel;
  ctx.strokeStyle = active ? COLORS.hud : COLORS.panelEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = active ? '#0b0e11' : COLORS.hud;
  ctx.font = `bold ${Math.max(11, b.h * 0.42)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('PILOT', b.x + b.w / 2, b.y + b.h / 2 + b.h * 0.15);
  ctx.textAlign = 'left';
}

function drawFireButton(ctx, state, vp) {
  const fb = fireButtonLayout(vp);
  const st = state.stations[state.activeStation];
  if (!st) return;
  const disabled = st.disabled;
  const jam = st.jammed;
  ctx.fillStyle = disabled ? 'rgba(70,70,74,0.8)' : jam ? 'rgba(120,70,60,0.85)' : (st.ammo > 0 ? COLORS.fire : 'rgba(80,80,80,0.7)');
  ctx.strokeStyle = jam ? COLORS.bad : COLORS.fireHot;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(fb.cx, fb.cy, fb.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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

export function drawRadio(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  if (!state.radio.length) return;
  const lh = Math.max(15, H * 0.035);
  const baseY = H * 0.92;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(12, H * 0.026)}px "Courier New", monospace`;
  const n = state.radio.length;
  for (let i = 0; i < n; i++) {
    const msg = state.radio[i];
    const y = baseY - (n - 1 - i) * lh;
    const alpha = Math.min(1, msg.t / 1.5);
    const col = msg.level === 'alert' ? '224,88,74' : msg.level === 'warn' ? '230,184,77' : '215,227,236';
    ctx.fillStyle = `rgba(0,0,0,${0.4 * alpha})`;
    const tw = ctx.measureText(msg.text).width + 24;
    roundRect(ctx, W / 2 - tw / 2, y - lh * 0.78, tw, lh * 0.95, 5); ctx.fill();
    ctx.fillStyle = `rgba(${col},${alpha})`;
    ctx.fillText(msg.text, W / 2, y);
  }
  ctx.textAlign = 'left';
}
