// Canvas rendering for the live views: the out-the-window cruise/combat scene
// and the top-down bombsight during the bomb run.

import { COLORS } from '../config.js';
import { activeArc, STATION_BY_ID } from '../stations.js';
import { projectFighter, activeFighters } from '../enemies.js';
import { drawShape, SHAPE_NAMES } from '../targets.js';
import { bombsightY, buildingScreenY } from '../bombing.js';

const HORIZON = { FRONT: 0.55, REAR: 0.55, LEFT: 0.5, RIGHT: 0.5, HIGH: 0.78, LOW: 0.26 };

export function drawCruise(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const arc = activeArc(state);
  const hY = H * (HORIZON[arc] ?? 0.55);

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, hY);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hY);

  // Ground with parallax field lines that slide as the plane advances.
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, hY, W, H - hY);
  ctx.strokeStyle = COLORS.groundDark;
  ctx.lineWidth = 2;
  const slide = (state.plane.position * 18) % 60;
  for (let yy = hY + 14 - slide; yy < H; yy += 60) {
    const t = (yy - hY) / (H - hY);
    ctx.globalAlpha = 0.25 + 0.5 * t;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Horizon line.
  ctx.strokeStyle = COLORS.horizon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hY);
  ctx.lineTo(W, hY);
  ctx.stroke();

  // Flak puffs.
  for (const b of state.flak) {
    const x = W / 2 + b.sx * W * 0.42;
    const y = hY * 0.5 + b.sy * H * 0.3;
    const r = 6 + b.age * 70;
    ctx.globalAlpha = Math.max(0, 1 - b.age / (b.fuse + 0.6));
    ctx.fillStyle = COLORS.flak;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.flakCore;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Fighters in the active arc.
  for (const f of state.fighters) {
    if (f.arc !== arc) continue;
    const p = projectFighter(f, vp);
    if (f.dying > 0) {
      drawExplosion(ctx, p.x, p.y, p.size * (1 + (0.45 - f.dying) * 3));
      continue;
    }
    drawFighter(ctx, p.x, p.y, p.size, f.sx);
    if (f.incoming > 0) {
      ctx.strokeStyle = 'rgba(255,90,70,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(W / 2, H * 0.5);
      ctx.stroke();
    }
  }

  // Player tracers.
  ctx.strokeStyle = COLORS.tracer;
  ctx.lineWidth = 3;
  for (const t of state.tracers) {
    ctx.globalAlpha = Math.max(0, t.life / 0.06);
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawWindowFrame(ctx, state, vp, arc);
  drawCrosshair(ctx, state.crosshair.x, state.crosshair.y);

  // Station label.
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${Math.max(14, H * 0.03)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(STATION_BY_ID[state.activeStation].label.toUpperCase(), W / 2, H * 0.07);
  ctx.textAlign = 'left';
}

function drawWindowFrame(ctx, state, vp, arc) {
  const W = vp.w, H = vp.h;
  // Dark interior frame to sell "looking out a gun position".
  ctx.strokeStyle = 'rgba(10,12,15,0.85)';
  const fw = Math.max(18, W * 0.03);
  ctx.lineWidth = fw;
  ctx.strokeRect(fw / 2, fw / 2, W - fw, H - fw);
  // A hint of the airframe for beam/tail stations.
  ctx.fillStyle = 'rgba(20,24,28,0.55)';
  if (arc === 'LEFT' || arc === 'RIGHT') {
    ctx.fillRect(0, H * 0.74, W, H * 0.26); // wing below
  } else if (arc === 'REAR') {
    ctx.fillRect(W * 0.42, 0, W * 0.16, H * 0.2); // tail fin above
  }
}

function drawFighter(ctx, x, y, s, bank) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bank * 0.3);
  ctx.fillStyle = COLORS.fighter;
  // wings
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.15, -s * 0.18);
  ctx.lineTo(-s * 0.15, -s * 0.18);
  ctx.closePath();
  ctx.fill();
  // fuselage
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.18, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // tail
  ctx.fillRect(-s * 0.22, s * 0.36, s * 0.44, s * 0.12);
  ctx.fillStyle = COLORS.fighterAccent;
  ctx.beginPath();
  ctx.arc(0, -s * 0.12, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExplosion(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(255,170,60,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,60,40,0.8)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrosshair(ctx, x, y) {
  ctx.strokeStyle = COLORS.crosshair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.moveTo(x - 26, y); ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y); ctx.lineTo(x + 26, y);
  ctx.moveTo(x, y - 26); ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 26);
  ctx.stroke();
  ctx.fillStyle = COLORS.crosshair;
  ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
}

// --- Bomb run ----------------------------------------------------------------

export function drawBombRun(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const bomb = state.bomb;
  const cy = bombsightY(vp);

  // Ground.
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = COLORS.groundDark;
  ctx.lineWidth = 2;
  const slide = bomb.scroll % 70;
  for (let yy = -slide; yy < H; yy += 70) {
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  }

  // Buildings (target + decoys) scrolling up toward the sight.
  const bsize = Math.max(12, H * 0.03);
  for (const b of bomb.buildings) {
    const y = buildingScreenY(state, b, vp);
    if (y < -120 || y > H + 120) continue;
    const x = W / 2 + b.lane * W * 0.4;
    drawShape(ctx, b.shape, x, y, bsize, COLORS.groundDark);
  }

  // Bombsight reticle.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, cy, bomb.dropWindowRadius, 0, Math.PI * 2);
  ctx.moveTo(W / 2 - bomb.dropWindowRadius - 16, cy);
  ctx.lineTo(W / 2 + bomb.dropWindowRadius + 16, cy);
  ctx.moveTo(W / 2, cy - bomb.dropWindowRadius - 16);
  ctx.lineTo(W / 2, cy + bomb.dropWindowRadius + 16);
  ctx.stroke();

  // Target reminder thumbnail (bridges from the briefing).
  drawTargetReminder(ctx, state, vp);

  // Result feedback.
  if (bomb.result) {
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.max(22, H * 0.05)}px "Courier New", monospace`;
    if (bomb.result.hit) {
      drawExplosion(ctx, W / 2, cy, 60);
      ctx.fillStyle = COLORS.good;
      ctx.fillText('TARGET HIT!', W / 2, H * 0.2);
    } else {
      ctx.fillStyle = COLORS.bad;
      ctx.fillText(bomb.result.missed ? 'BOMBS NOT DROPPED' : 'MISSED THE TARGET', W / 2, H * 0.2);
    }
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.max(14, H * 0.028)}px "Courier New", monospace`;
    ctx.fillText('Line up the FACTORY and DROP', W / 2, H * 0.09);
    ctx.textAlign = 'left';
  }
}

function drawTargetReminder(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const pad = Math.max(10, W * 0.012);
  const bw = Math.max(120, W * 0.16);
  const bh = bw * 0.7;
  const x = W - bw - pad, y = pad;
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, bw, bh, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = `bold ${Math.max(10, H * 0.02)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('YOUR TARGET', x + bw / 2, y + bh * 0.2);
  drawShape(ctx, state.mission.target.shape, x + bw / 2, y + bh * 0.6, bw * 0.07, COLORS.hud);
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(SHAPE_NAMES[state.mission.target.shape] || 'Target', x + bw / 2, y + bh * 0.92);
  ctx.textAlign = 'left';
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
