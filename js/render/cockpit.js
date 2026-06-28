// Pilot / cockpit view: a windscreen strip over an instrument panel, plus the
// usable control switches. Shares the plane diagram, pilot button, and radio
// feed with the gun HUD so the player can switch back.

import { COLORS, CONTROL } from '../config.js';
import { enginesOut } from '../state.js';
import { roundRect } from './world.js';
import { drawPlaneDiagram, drawPilotButton, drawRadio, drawProgress } from './hud.js';

function dial(ctx, cx, cy, r, frac, label, value, color) {
  ctx.fillStyle = 'rgba(8,11,14,0.9)';
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // ticks
  ctx.strokeStyle = COLORS.hudDim;
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 10; i++) {
    const a = (-225 + i * 27) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  // needle
  const ang = (-225 + Math.max(0, Math.min(1, frac)) * 270) * Math.PI / 180;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * r * 0.72, cy + Math.sin(ang) * r * 0.72);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.hud;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(9, r * 0.26)}px "Courier New", monospace`;
  ctx.fillText(label, cx, cy + r * 0.5);
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(value, cx, cy + r * 0.8);
  ctx.textAlign = 'left';
}

function warnLight(ctx, x, y, w, h, on, label, color) {
  ctx.fillStyle = on ? color : 'rgba(40,46,52,0.9)';
  roundRect(ctx, x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = COLORS.panelEdge; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = on ? '#0b0e11' : COLORS.hudDim;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(10, h * 0.4)}px "Courier New", monospace`;
  ctx.fillText(label, x + w / 2, y + h * 0.62);
  ctx.textAlign = 'left';
}

export function drawCockpit(ctx, state, vp) {
  const W = vp.w, H = vp.h;

  // Windscreen strip (you're up front, flying).
  const wsH = H * 0.34;
  const sky = ctx.createLinearGradient(0, 0, 0, wsH);
  sky.addColorStop(0, '#16335c');
  sky.addColorStop(1, '#9fc0dc');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, wsH);
  ctx.fillStyle = COLORS.cloud;
  for (let i = 0; i < 4; i++) {
    const x = ((state.plane.position * (4 + i) ) % (W + 200));
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(((i * 250 - x) % (W + 200) + (W + 200)) % (W + 200) - 100, wsH * (0.4 + 0.12 * i), 70, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Green-tinted window framing (B-17 cockpit glazing) + center post.
  ctx.fillStyle = '#3a4a3c';
  ctx.fillRect(W / 2 - 7, 0, 14, wsH);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.16, 0); ctx.lineTo(0, wsH); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W * 0.84, 0); ctx.lineTo(W, wsH); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Glareshield hood over the panel.
  const glare = ctx.createLinearGradient(0, wsH - 10, 0, wsH + H * 0.05);
  glare.addColorStop(0, '#272f27');
  glare.addColorStop(1, '#11161a');
  ctx.fillStyle = glare;
  ctx.fillRect(0, wsH - 10, W, H * 0.06);

  // Instrument panel with rivets.
  ctx.fillStyle = '#191f24';
  ctx.fillRect(0, wsH + H * 0.04, W, H - wsH);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let yy = wsH + H * 0.06; yy < H; yy += 34) {
    for (let xx = 20; xx < W; xx += 46) {
      ctx.beginPath(); ctx.arc(xx + (Math.floor(yy) % 2) * 23, yy, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Bezel behind the gauge cluster.
  const r = Math.min(W * 0.048, H * 0.1);
  const cy = wsH + (H - wsH) * 0.44;
  const gap = r * 2.3;
  const startX = W * 0.25;
  ctx.fillStyle = '#10151a';
  roundRect(ctx, startX - r * 1.5, cy - r * 1.5, gap * 3 + r * 3, r * 2.6, 12); ctx.fill();
  ctx.strokeStyle = '#2b343c'; ctx.lineWidth = 2; ctx.stroke();

  dial(ctx, startX, cy, r, (state.throttle - CONTROL.throttleMin) / (CONTROL.throttleMax - CONTROL.throttleMin),
    'AIRSPEED', `${Math.round(state.throttle * 180)} mph`, COLORS.good);
  dial(ctx, startX + gap, cy, r, state.plane.altitude / state.mission.cruiseAltitude,
    'ALTITUDE', `${(state.plane.altitude / 1000).toFixed(0)}k ft`, state.plane.altitude < state.mission.minAltitudeToProceed ? COLORS.bad : COLORS.hud);
  dial(ctx, startX + gap * 2, cy, r, state.plane.fuel / 100,
    'FUEL', `${Math.round(state.plane.fuel)}%`, state.plane.fuel > 30 ? COLORS.good : COLORS.warn);
  dial(ctx, startX + gap * 3, cy, r, state.plane.health / 100,
    'AIRFRAME', `${Math.round(state.plane.health)}%`, state.plane.health > 40 ? COLORS.good : COLORS.bad);

  // Warning lights.
  const lw = Math.max(70, W * 0.09), lh = Math.max(26, H * 0.06);
  const ly = wsH + (H - wsH) * 0.56;
  const lx = (startX + gap * 1.5) - lw * 1.6;
  warnLight(ctx, lx, ly, lw, lh, state.systems.engineFire.some(Boolean), 'ENGINE FIRE', COLORS.bad);
  warnLight(ctx, lx + lw * 1.1, ly, lw, lh, state.systems.fuelLeak > 0, 'FUEL LEAK', COLORS.warn);
  warnLight(ctx, lx + lw * 2.2, ly, lw, lh, enginesOut(state) > 0, `ENG OUT ${enginesOut(state)}`, COLORS.bad);

  ctx.fillStyle = COLORS.hudDim;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(11, H * 0.024)}px "Courier New", monospace`;
  ctx.fillText("PILOT'S SEAT — work the throttle and damage control, then get back on the guns", W / 2, wsH + 22);
  ctx.textAlign = 'left';

  drawControlButtons(ctx, state, vp);
  drawProgress(ctx, state, vp);
  drawPlaneDiagram(ctx, state, vp);
  drawPilotButton(ctx, state, vp);
  drawRadio(ctx, state, vp);
}

function drawControlButtons(ctx, state, vp) {
  for (const b of state.ui.buttons) {
    if (!b.ctrl) continue;
    const alpha = b.dim ? 0.5 : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.alert ? 'rgba(120,55,48,0.95)' : COLORS.panel;
    ctx.strokeStyle = b.alert ? COLORS.bad : COLORS.fireHot;
    ctx.lineWidth = 2;
    roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.hud;
    ctx.font = `bold ${Math.max(13, b.h * 0.32)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + b.h * 0.12);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}
