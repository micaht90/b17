// Canvas rendering for the live views: the out-the-window cruise/combat scene
// (high-altitude, per-seat framing) and the top-down bombsight.

import { COLORS, GUN, GUNS } from '../config.js';
import { activeArc, STATION_BY_ID, traverseRect } from '../stations.js';
import { projectFighter } from '../enemies.js';
import { currentSpread } from '../combat.js';
import { drawShape, SHAPE_NAMES } from '../targets.js';
import { bombsightY, buildingScreenY } from '../bombing.js';

// We are at 25,000 ft: mostly sky, a cloud undercast far below. Horizon sits low.
const HORIZON = { FRONT: 0.8, REAR: 0.8, LEFT: 0.78, RIGHT: 0.78, HIGH: 0.93, LOW: 0.4 };
const BEARING = { FRONT: '12 O\'CLOCK', REAR: '6 O\'CLOCK', LEFT: '9 O\'CLOCK', RIGHT: '3 O\'CLOCK', HIGH: '12 HIGH', LOW: '6 LOW' };

export function drawCruise(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const arc = activeArc(state);
  const hY = H * (HORIZON[arc] ?? 0.8);

  ctx.save();
  if (state.shake > 0) {
    const s = state.shake * 7;
    ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  drawHighAltitude(ctx, state, vp, hY);

  // Flak puffs.
  for (const b of state.flak) {
    const x = W / 2 + b.sx * W * 0.42;
    const y = hY * 0.55 + b.sy * H * 0.3;
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
    ctx.lineTo(W / 2 + (Math.random() * 2 - 1) * 20, H * 0.7);
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

  drawSeatFrame(ctx, state, vp, arc);
  drawGunsAndReticle(ctx, state, vp);
  drawStationLabel(ctx, state, vp, arc);

  if (state.hitFlash > 0) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(224,88,74,0)');
    vg.addColorStop(1, `rgba(224,88,74,${0.5 * state.hitFlash})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawHighAltitude(ctx, state, vp, hY) {
  const W = vp.w, H = vp.h;
  // Deep sky.
  const sky = ctx.createLinearGradient(0, -20, 0, hY);
  sky.addColorStop(0, '#16335c');
  sky.addColorStop(0.55, COLORS.skyTop);
  sky.addColorStop(1, '#9fc0dc');
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, W + 40, hY + 20);

  // High cloud layer drifting in the sky.
  drawDriftClouds(ctx, state, vp, hY * 0.5, 8, 0.7);

  // Haze band at the horizon.
  const haze = ctx.createLinearGradient(0, hY - H * 0.06, 0, hY + H * 0.04);
  haze.addColorStop(0, 'rgba(200,220,235,0)');
  haze.addColorStop(1, 'rgba(210,224,235,0.85)');
  ctx.fillStyle = haze;
  ctx.fillRect(-20, hY - H * 0.06, W + 40, H * 0.1);

  // Cloud undercast far below (the "ground" is mostly cloud tops + faint earth).
  const deck = ctx.createLinearGradient(0, hY, 0, H);
  deck.addColorStop(0, '#b9c6cf');
  deck.addColorStop(0.5, '#9aa6a2');
  deck.addColorStop(1, '#7e8472');
  ctx.fillStyle = deck;
  ctx.fillRect(-20, hY, W + 40, H - hY + 20);
  // Cloud tops on the undercast, slow parallax.
  drawDriftClouds(ctx, state, vp, hY + (H - hY) * 0.45, 6, 0.9, 0.5);
  // Faint earth patchwork showing through.
  ctx.strokeStyle = 'rgba(90,95,70,0.18)';
  ctx.lineWidth = 1;
  const slide = (state.plane.position * 6) % 50;
  for (let yy = hY + 18 - slide; yy < H; yy += 50) {
    ctx.beginPath(); ctx.moveTo(-20, yy); ctx.lineTo(W + 20, yy); ctx.stroke();
  }
}

function drawDriftClouds(ctx, state, vp, baseY, count, alpha, speedMul = 1) {
  const W = vp.w;
  ctx.fillStyle = COLORS.cloud;
  for (let i = 0; i < count; i++) {
    const seed = (i * 0.173) % 1;
    const drift = (state.plane.position * (5 + i * 1.5) * speedMul) % (W + 300);
    const x = ((seed * (W + 300) - drift) % (W + 300) + (W + 300)) % (W + 300) - 150;
    const y = baseY + Math.sin(seed * 7) * vp.h * 0.05;
    const s = (24 + (i % 3) * 10) * (vp.h / 540);
    ctx.globalAlpha = alpha * (0.6 + 0.4 * ((i % 3) / 2));
    ctx.beginPath();
    ctx.ellipse(x, y, s * 2.2, s * 0.85, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s, y + s * 0.2, s * 1.4, s * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s, y + s * 0.15, s * 1.2, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFighter(ctx, x, y, s, f) {
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
  ctx.beginPath();
  ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.16, -s * 0.16); ctx.lineTo(-s * 0.16, -s * 0.16);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.17, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-s * 0.24, s * 0.34, s * 0.48, s * 0.12);
  ctx.fillStyle = COLORS.fighterCanopy;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.09, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
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

// Distinct framing per seat so each gun position feels like being in it.
function drawSeatFrame(ctx, state, vp, arc) {
  const W = vp.w, H = vp.h;
  // Interior vignette (you're inside the fuselage).
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(8,10,13,0)');
  vg.addColorStop(1, 'rgba(8,10,13,0.78)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(14,17,21,0.95)';
  ctx.fillStyle = 'rgba(16,20,24,0.85)';
  const turret = arc === 'HIGH' || arc === 'LOW' || arc === 'REAR';

  if (turret) {
    // Round turret glass: dark ring with canopy struts.
    ctx.lineWidth = Math.max(22, W * 0.05);
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.46, Math.min(W, H) * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30,36,42,0.8)';
    for (let a = 0; a < 4; a++) {
      const ang = a * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.46);
      ctx.lineTo(W / 2 + Math.cos(ang) * W, H * 0.46 + Math.sin(ang) * H);
      ctx.stroke();
    }
  } else if (arc === 'LEFT' || arc === 'RIGHT') {
    // Open waist window: thick frame on the firing side + wind streaks.
    ctx.lineWidth = Math.max(20, W * 0.04);
    ctx.strokeRect(W * 0.08, H * 0.14, W * 0.84, H * 0.66);
    ctx.fillRect(0, H * 0.8, W, H * 0.2); // fuselage floor
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    const sl = (state.plane.position * 40) % 60;
    for (let x = -sl; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, H * 0.2); ctx.lineTo(x + 30, H * 0.2); ctx.stroke();
    }
  } else {
    // Glazed nose: framing bars.
    ctx.lineWidth = Math.max(18, W * 0.035);
    ctx.strokeRect(W * 0.06, H * 0.08, W * 0.88, H * 0.74);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(26,32,38,0.85)';
    ctx.beginPath(); ctx.moveTo(W / 2, H * 0.08); ctx.lineTo(W / 2, H * 0.82); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.06, H * 0.45); ctx.lineTo(W * 0.94, H * 0.45); ctx.stroke();
  }
}

function drawGunsAndReticle(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const st = state.stations[state.activeStation];
  const cx = state.crosshair.x, cy = state.crosshair.y;
  const twin = GUNS[state.activeStation] && GUNS[state.activeStation].type === 'twin';

  // Traverse bounds.
  const tr = traverseRect(state.activeStation, vp);
  ctx.strokeStyle = 'rgba(215,227,236,0.12)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.strokeRect(tr.x, tr.y, tr.w, tr.h);
  ctx.setLineDash([]);

  // Gun barrel(s) from the mount toward the crosshair.
  const bx = W / 2, by = H * 1.0;
  const ang = Math.atan2(cy - by, cx - bx);
  const offsets = twin ? [-12, 12] : [0];
  for (const off of offsets) {
    ctx.save();
    ctx.translate(bx + off * Math.cos(ang + Math.PI / 2), by + off * Math.sin(ang + Math.PI / 2));
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#13171c';
    ctx.fillRect(-7, -H * 0.2, 14, H * 0.22);
    ctx.fillStyle = '#2a3138';
    ctx.fillRect(-4, -H * 0.22, 8, H * 0.05);
    ctx.restore();
  }

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

function drawStationLabel(ctx, state, vp, arc) {
  const W = vp.w, H = vp.h;
  const st = state.stations[state.activeStation];
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.hud;
  ctx.font = `bold ${Math.max(13, H * 0.028)}px "Courier New", monospace`;
  ctx.fillText(`${STATION_BY_ID[state.activeStation].label.toUpperCase()} — ${BEARING[arc]}`, W / 2, H * 0.07);
  if (st.disabled) { ctx.fillStyle = COLORS.bad; ctx.fillText('GUN KNOCKED OUT', W / 2, H * 0.115); }
  else if (st.jammed) { ctx.fillStyle = COLORS.warn; ctx.fillText('OVERHEATED — LET IT COOL', W / 2, H * 0.115); }
  else if (st.wounded) { ctx.fillStyle = COLORS.warn; ctx.fillText('GUNNER WOUNDED', W / 2, H * 0.115); }
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
