// Canvas rendering for the live views: the out-the-window cruise/combat scene
// and the top-down bombsight during the bomb run.

import { COLORS, GUN } from '../config.js';
import { activeArc, STATION_BY_ID, traverseRect } from '../stations.js';
import { projectFighter } from '../enemies.js';
import { currentSpread } from '../combat.js';
import { drawShape, SHAPE_NAMES } from '../targets.js';
import { bombsightY, buildingScreenY } from '../bombing.js';

const HORIZON = { FRONT: 0.56, REAR: 0.56, LEFT: 0.5, RIGHT: 0.5, HIGH: 0.8, LOW: 0.24 };

export function drawCruise(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const arc = activeArc(state);
  const hY = H * (HORIZON[arc] ?? 0.56);

  // --- Shaking "outside world" ---
  ctx.save();
  if (state.shake > 0) {
    const s = state.shake * 7;
    ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  // Sky.
  const sky = ctx.createLinearGradient(0, -20, 0, hY);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(0.6, COLORS.skyMid);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, W + 40, hY + 20);

  drawClouds(ctx, state, vp, hY);

  // Ground.
  const grd = ctx.createLinearGradient(0, hY, 0, H);
  grd.addColorStop(0, COLORS.groundFar);
  grd.addColorStop(1, COLORS.ground);
  ctx.fillStyle = grd;
  ctx.fillRect(-20, hY, W + 40, H - hY + 20);
  ctx.strokeStyle = COLORS.groundDark;
  ctx.lineWidth = 2;
  const slide = (state.plane.position * 16) % 60;
  for (let yy = hY + 16 - slide; yy < H; yy += 60) {
    const t = (yy - hY) / (H - hY);
    ctx.globalAlpha = 0.2 + 0.5 * t;
    ctx.beginPath();
    ctx.moveTo(-20, yy);
    ctx.lineTo(W + 20, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.horizon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, hY);
  ctx.lineTo(W + 20, hY);
  ctx.stroke();

  // Flak puffs.
  for (const b of state.flak) {
    const x = W / 2 + b.sx * W * 0.42;
    const y = hY * 0.5 + b.sy * H * 0.3;
    const r = 6 + b.age * 70;
    ctx.globalAlpha = Math.max(0, 1 - b.age / (b.fuse + 0.6));
    ctx.fillStyle = COLORS.flak;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.flakCore;
    ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Incoming enemy tracers.
  ctx.strokeStyle = COLORS.tracerEnemy;
  ctx.lineWidth = 2.5;
  for (const t of state.enemyTracers) {
    if (t.from.arc !== arc) continue;
    const p = projectFighter(t.from, vp);
    ctx.globalAlpha = Math.max(0, t.life / 0.12);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(W / 2 + (Math.random() * 2 - 1) * 20, H * 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Fighters in the active arc.
  for (const f of state.fighters) {
    if (f.arc !== arc) continue;
    const p = projectFighter(f, vp);
    if (f.dying > 0) { drawExplosion(ctx, p.x, p.y, p.size * (1 + (0.5 - f.dying) * 3)); continue; }
    ctx.globalAlpha = p.alpha;
    drawFighter(ctx, p.x, p.y, p.size, f);
    ctx.globalAlpha = 1;
    if (f.state === 'pass' && f.warn > 0 && Math.floor(f.warn * 8) % 2 === 0) {
      ctx.fillStyle = COLORS.bad;
      ctx.font = `bold ${Math.max(16, p.size * 0.5)}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('!', p.x, p.y - p.size * 0.7);
      ctx.textAlign = 'left';
    }
  }

  // Player tracers.
  ctx.strokeStyle = COLORS.tracer;
  ctx.lineWidth = 3;
  for (const t of state.tracers) {
    ctx.globalAlpha = Math.max(0, t.life / 0.07);
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end shake

  // --- Steady cockpit overlay ---
  drawWindowFrame(ctx, vp, arc);
  drawGunAndReticle(ctx, state, vp);
  drawStationLabel(ctx, state, vp);

  // Damage flash vignette.
  if (state.hitFlash > 0) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(224,88,74,0)');
    vg.addColorStop(1, `rgba(224,88,74,${0.5 * state.hitFlash})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawClouds(ctx, state, vp, hY) {
  const W = vp.w;
  ctx.fillStyle = COLORS.cloud;
  const seeds = [0.1, 0.34, 0.55, 0.78, 0.92];
  for (let i = 0; i < seeds.length; i++) {
    const drift = (state.plane.position * (6 + i * 2)) % (W + 240);
    const x = ((seeds[i] * W - drift) % (W + 240) + (W + 240)) % (W + 240) - 120;
    const y = hY * (0.2 + 0.13 * i);
    const s = (28 + i * 8) * (vp.h / 540);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 2, s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s, y + s * 0.3, s * 1.4, s * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s, y + s * 0.2, s * 1.2, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFighter(ctx, x, y, s, f) {
  // Damage smoke trail.
  if (f.hp < GUN.fighterHp) {
    ctx.fillStyle = COLORS.smoke;
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.4 / i;
      ctx.beginPath();
      ctx.arc(x - i * s * 0.35, y + i * s * 0.3, s * 0.28 * i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((f.bank || 0) * 0.35);
  ctx.fillStyle = COLORS.fighter;
  // wings
  ctx.beginPath();
  ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.16, -s * 0.16); ctx.lineTo(-s * 0.16, -s * 0.16);
  ctx.closePath(); ctx.fill();
  // fuselage
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.17, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // tailplane
  ctx.fillRect(-s * 0.24, s * 0.34, s * 0.48, s * 0.12);
  // canopy
  ctx.fillStyle = COLORS.fighterCanopy;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.09, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // muzzle flashes (wing roots) while firing a pass
  if (f.muzzle > 0) {
    ctx.fillStyle = COLORS.tracer;
    ctx.beginPath(); ctx.arc(-s * 0.4, -s * 0.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawExplosion(ctx, x, y, r) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(40,40,44,0.55)';
  ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,170,60,0.95)';
  ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,180,0.95)';
  ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, Math.PI * 2); ctx.fill();
}

function drawWindowFrame(ctx, vp, arc) {
  const W = vp.w, H = vp.h;
  ctx.strokeStyle = 'rgba(10,12,15,0.9)';
  const fw = Math.max(20, W * 0.035);
  ctx.lineWidth = fw;
  ctx.strokeRect(fw / 2, fw / 2, W - fw, H - fw);
  ctx.fillStyle = 'rgba(18,22,26,0.6)';
  if (arc === 'LEFT' || arc === 'RIGHT') ctx.fillRect(0, H * 0.76, W, H * 0.24);
  else if (arc === 'REAR') ctx.fillRect(W * 0.42, 0, W * 0.16, H * 0.2);
  else if (arc === 'LOW') ctx.fillRect(0, 0, W, H * 0.08);
}

function drawGunAndReticle(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const st = state.stations[state.activeStation];
  const cx = state.crosshair.x, cy = state.crosshair.y;

  // Traverse bounds (subtle).
  const tr = traverseRect(state.activeStation, vp);
  ctx.strokeStyle = 'rgba(215,227,236,0.12)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.strokeRect(tr.x, tr.y, tr.w, tr.h);
  ctx.setLineDash([]);

  // Gun barrel from the bottom toward the crosshair.
  const bx = W / 2, by = H * 0.99;
  const ang = Math.atan2(cy - by, cx - bx);
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = '#15191e';
  ctx.fillRect(-9, -H * 0.16, 18, H * 0.18);
  ctx.fillStyle = '#2a3138';
  ctx.fillRect(-5, -H * 0.18, 10, H * 0.06);
  ctx.restore();

  // Spread reticle.
  const jam = st.jammed || st.disabled;
  const col = jam ? COLORS.crosshairJam : COLORS.crosshair;
  const spread = currentSpread(state);
  ctx.strokeStyle = jam ? 'rgba(154,163,173,0.5)' : 'rgba(255,90,77,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, spread, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - 9, cy);
  ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + 24, cy);
  ctx.moveTo(cx, cy - 24); ctx.lineTo(cx, cy - 9);
  ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + 24);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
}

function drawStationLabel(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const st = state.stations[state.activeStation];
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${Math.max(14, H * 0.03)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(STATION_BY_ID[state.activeStation].label.toUpperCase(), W / 2, H * 0.075);
  if (st.disabled) {
    ctx.fillStyle = COLORS.bad;
    ctx.fillText('GUN KNOCKED OUT', W / 2, H * 0.12);
  } else if (st.jammed) {
    ctx.fillStyle = COLORS.warn;
    ctx.fillText('OVERHEATED — LET IT COOL', W / 2, H * 0.12);
  } else if (st.wounded) {
    ctx.fillStyle = COLORS.warn;
    ctx.fillText('GUNNER WOUNDED', W / 2, H * 0.12);
  }
  ctx.textAlign = 'left';
}

// --- Bomb run ----------------------------------------------------------------

export function drawBombRun(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const bomb = state.bomb;
  const cy = bombsightY(vp);

  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = COLORS.groundDark;
  ctx.lineWidth = 2;
  const slide = bomb.scroll % 70;
  for (let yy = -slide; yy < H; yy += 70) {
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }

  const bsize = Math.max(12, H * 0.03);
  for (const b of bomb.buildings) {
    const y = buildingScreenY(state, b, vp);
    if (y < -120 || y > H + 120) continue;
    const x = W / 2 + b.lane * W * 0.4;
    drawShape(ctx, b.shape, x, y, bsize, COLORS.groundDark);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, cy, bomb.dropWindowRadius, 0, Math.PI * 2);
  ctx.moveTo(W / 2 - bomb.dropWindowRadius - 16, cy);
  ctx.lineTo(W / 2 + bomb.dropWindowRadius + 16, cy);
  ctx.moveTo(W / 2, cy - bomb.dropWindowRadius - 16);
  ctx.lineTo(W / 2, cy + bomb.dropWindowRadius + 16);
  ctx.stroke();

  drawTargetReminder(ctx, state, vp);

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
  roundRect(ctx, x, y, bw, bh, 8); ctx.fill(); ctx.stroke();
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
