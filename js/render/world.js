// Canvas rendering for the live views: the out-the-window cruise/combat scene
// (high-altitude, per-seat framing) and the top-down bombsight.

import { COLORS, GUN, GUNS } from '../config.js';
import { activeArc, STATION_BY_ID } from '../stations.js';
import { projectFighter, arcsUnderThreat } from '../enemies.js';
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
  drawThreatArrows(ctx, state, vp, arc);

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

// An enemy fighter seen head-on, DIVING toward the gunner: prop disc and engine
// cowl point at the viewer (down/near), canopy and tail away (up/far).
function drawFighter(ctx, x, y, s, f) {
  // Smoke trail streaming up/behind a damaged fighter.
  if (f.hp < GUN.fighterHp) {
    ctx.fillStyle = COLORS.smoke;
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.45 / i;
      ctx.beginPath();
      ctx.arc(x + (f.bank || 0) * i * s * 0.2, y - i * s * 0.5, s * 0.26 * i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((f.bank || 0) * 0.4);

  // Tailplane + fin (far side, up).
  ctx.fillStyle = COLORS.fighter;
  ctx.fillRect(-s * 0.3, -s * 0.62, s * 0.6, s * 0.1);
  ctx.fillRect(-s * 0.05, -s * 0.72, s * 0.1, s * 0.16);

  // Wings (full span, slight gull).
  ctx.beginPath();
  ctx.moveTo(-s * 1.05, s * 0.02);
  ctx.quadraticCurveTo(0, -s * 0.14, s * 1.05, s * 0.02);
  ctx.quadraticCurveTo(s * 0.5, s * 0.16, 0, s * 0.1);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.16, -s * 1.05, s * 0.02);
  ctx.fill();

  // Fuselage.
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.2, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Canopy (on top, toward the tail).
  ctx.fillStyle = COLORS.fighterCanopy;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.2, s * 0.12, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Engine cowl + spinning prop disc at the nose (toward viewer).
  ctx.fillStyle = '#11151a';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.46, s * 0.24, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,198,206,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 0.6, s * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.fighterAccent;
  ctx.beginPath();
  ctx.arc(0, s * 0.52, s * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Wing-gun muzzle flashes during a firing pass.
  if (f.muzzle > 0) {
    ctx.fillStyle = COLORS.tracer;
    ctx.beginPath(); ctx.arc(-s * 0.5, s * 0.04, s * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.04, s * 0.13, 0, Math.PI * 2); ctx.fill();
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

  // Gun-mount cradle rising from the bottom (the gun pivots out of it).
  ctx.fillStyle = '#10141a';
  ctx.beginPath();
  ctx.moveTo(W / 2 - W * 0.17, H);
  ctx.lineTo(W / 2 - W * 0.07, H * 0.88);
  ctx.lineTo(W / 2 + W * 0.07, H * 0.88);
  ctx.lineTo(W / 2 + W * 0.17, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1b222a';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.89, W * 0.08, H * 0.02, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A Browning M2 .50 cal: receiver + perforated cooling jacket, pointing from
// (bx,by) toward angle `ang`. Drawn in the foreground like a real gun seat.
function drawFiftyCal(ctx, bx, by, ang, len, firing) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ang + Math.PI / 2); // gun "up" axis points at the target

  // Receiver block at the base.
  ctx.fillStyle = '#15191e';
  ctx.fillRect(-22, -len * 0.16, 44, len * 0.2);
  ctx.fillStyle = '#23292f';
  ctx.fillRect(-16, -len * 0.12, 32, len * 0.12);
  // Spade grips hint.
  ctx.fillStyle = '#10141a';
  ctx.fillRect(-26, -len * 0.02, 10, len * 0.12);
  ctx.fillRect(16, -len * 0.02, 10, len * 0.12);

  // Perforated cooling jacket (barrel).
  const bw = 15;
  ctx.fillStyle = '#1b2026';
  ctx.fillRect(-bw / 2, -len, bw, len * 0.84);
  ctx.fillStyle = '#0c0f13';
  for (let y = -len * 0.92; y < -len * 0.06; y += len * 0.075) {
    ctx.beginPath(); ctx.arc(0, y, 3.2, 0, Math.PI * 2); ctx.fill();
  }
  // Muzzle / flash hider.
  ctx.fillStyle = '#2a3138';
  ctx.fillRect(-bw / 2 - 2, -len - 8, bw + 4, 12);
  if (firing) {
    ctx.fillStyle = 'rgba(255,210,120,0.9)';
    ctx.beginPath(); ctx.arc(0, -len - 8, 9 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Classic ring-and-bead ("cartwheel") gunsight at the aim point.
function drawRingSight(ctx, cx, cy, col, spread) {
  // Faint spread ring (sustained-fire scatter).
  ctx.strokeStyle = col === COLORS.crosshairJam ? 'rgba(154,163,173,0.4)' : 'rgba(255,90,77,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(spread, 16), 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 2.5;
  // Outer ring.
  ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
  // Cardinal posts pointing inward.
  ctx.lineWidth = 3;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
    ctx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
    ctx.stroke();
  }
  // Center bead.
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
}

function drawGunsAndReticle(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const st = state.stations[state.activeStation];
  const cx = state.crosshair.x, cy = state.crosshair.y;
  const twin = GUNS[state.activeStation] && GUNS[state.activeStation].type === 'twin';
  const firing = state.muzzleFlash > 0;

  // Foreground .50 cal(s) sweeping toward the aim point.
  const bx = W / 2, by = H * 1.06;
  const ang = Math.atan2(cy - by, cx - bx);
  const len = H * 0.46;
  const offsets = twin ? [-20, 20] : [0];
  for (const off of offsets) {
    drawFiftyCal(ctx, bx + off * Math.cos(ang + Math.PI / 2), by + off * Math.sin(ang + Math.PI / 2), ang, len, firing);
  }

  const jam = st.jammed || st.disabled;
  drawRingSight(ctx, cx, cy, jam ? COLORS.crosshairJam : COLORS.crosshair, currentSpread(state));
}

// Pulsing edge arrows pointing toward arcs that have attacking fighters you're
// NOT currently manning — so you can see where they're coming from.
function drawThreatArrows(ctx, state, vp, activeArcName) {
  const W = vp.w, H = vp.h;
  const threats = arcsUnderThreat(state);
  if (!threats.size) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 140);
  const anchors = {
    FRONT: { x: W / 2, y: H * 0.13, dir: 'up' },
    HIGH: { x: W * 0.3, y: H * 0.13, dir: 'up' },
    REAR: { x: W / 2, y: H * 0.87, dir: 'down' },
    LOW: { x: W * 0.7, y: H * 0.87, dir: 'down' },
    LEFT: { x: W * 0.07, y: H * 0.5, dir: 'left' },
    RIGHT: { x: W * 0.93, y: H * 0.5, dir: 'right' },
  };
  for (const arc of threats) {
    if (arc === activeArcName) continue;
    const a = anchors[arc];
    if (!a) continue;
    const sz = Math.max(18, H * 0.04);
    ctx.fillStyle = `rgba(224,88,74,${pulse})`;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (a.dir === 'up') { ctx.moveTo(a.x, a.y - sz); ctx.lineTo(a.x - sz * 0.8, a.y + sz * 0.5); ctx.lineTo(a.x + sz * 0.8, a.y + sz * 0.5); }
    else if (a.dir === 'down') { ctx.moveTo(a.x, a.y + sz); ctx.lineTo(a.x - sz * 0.8, a.y - sz * 0.5); ctx.lineTo(a.x + sz * 0.8, a.y - sz * 0.5); }
    else if (a.dir === 'left') { ctx.moveTo(a.x - sz, a.y); ctx.lineTo(a.x + sz * 0.5, a.y - sz * 0.8); ctx.lineTo(a.x + sz * 0.5, a.y + sz * 0.8); }
    else { ctx.moveTo(a.x + sz, a.y); ctx.lineTo(a.x - sz * 0.5, a.y - sz * 0.8); ctx.lineTo(a.x - sz * 0.5, a.y + sz * 0.8); }
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = `rgba(255,210,200,${pulse})`;
    ctx.font = `bold ${Math.max(11, H * 0.024)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    const ly = a.dir === 'down' ? a.y - sz - 6 : a.y + sz + H * 0.03;
    ctx.fillText(BEARING[arc], a.x, ly);
    ctx.textAlign = 'left';
  }
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

// An aerial reconnaissance-style map below the bombsight: patchwork fields, a
// winding river, roads. Features are placed in the same world space as the
// buildings (screenY = cy + worldY - scroll) so everything scrolls together.
function drawAerialMap(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const scroll = state.bomb.scroll;
  const cy = bombsightY(vp);
  const toY = (wy) => cy + (wy - scroll);

  ctx.fillStyle = '#6e7b4c';
  ctx.fillRect(0, 0, W, H);

  // Patchwork fields.
  const cell = Math.max(70, H * 0.16);
  const pal = ['#7c8a50', '#93a05f', '#b3ab73', '#67753f', '#a89a6a', '#5d6b3a', '#8a9657', '#9caa66'];
  const top = scroll - cy - cell, bot = scroll - cy + H + cell;
  for (let gyc = Math.floor(top / cell); gyc <= Math.ceil(bot / cell); gyc++) {
    const sy = toY(gyc * cell);
    for (let gx = -1; gx * cell < W + cell; gx++) {
      const k = gx * 97 + gyc * 191;
      ctx.fillStyle = pal[((k % pal.length) + pal.length) % pal.length];
      ctx.fillRect(gx * cell + (Math.abs(gyc) % 2) * cell * 0.5, sy, cell - 3, cell - 3);
    }
  }

  // River.
  ctx.strokeStyle = '#4d6f93';
  ctx.lineWidth = Math.max(10, W * 0.018);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let wy = top; wy <= bot; wy += 24) {
    const x = W * 0.28 + Math.sin(wy * 0.004) * W * 0.16;
    wy === top ? ctx.moveTo(x, toY(wy)) : ctx.lineTo(x, toY(wy));
  }
  ctx.stroke();

  // Roads (a winding lane + a couple of cross-roads).
  ctx.strokeStyle = 'rgba(64,62,56,0.9)';
  ctx.lineWidth = Math.max(3, W * 0.006);
  ctx.beginPath();
  for (let wy = top; wy <= bot; wy += 24) {
    const x = W * 0.66 + Math.sin(wy * 0.002 + 1) * W * 0.05;
    wy === top ? ctx.moveTo(x, toY(wy)) : ctx.lineTo(x, toY(wy));
  }
  ctx.stroke();
  for (const ry of [Math.floor(scroll / 320) * 320, Math.floor(scroll / 320) * 320 + 320]) {
    ctx.beginPath(); ctx.moveTo(0, toY(ry)); ctx.lineTo(W, toY(ry) + 22); ctx.stroke();
  }
}

// A speckle of small buildings around a structure, so it reads as a town and
// the briefed target must be picked out from it.
function drawTownCluster(ctx, x, y, s, seed) {
  ctx.fillStyle = '#565a4b';
  for (let i = 0; i < 12; i++) {
    const a = seed * 0.7 + i * 1.7;
    const dx = Math.sin(a) * s * 2.4;
    const dy = Math.cos(a * 1.3) * s * 2.0;
    const w = s * (0.28 + 0.28 * Math.abs(Math.sin(a * 2.1)));
    ctx.fillRect(x + dx, y + dy, w, w * 0.78);
  }
}

export function drawBombRun(ctx, state, vp) {
  const W = vp.w, H = vp.h;
  const bomb = state.bomb;
  const cy = bombsightY(vp);

  drawAerialMap(ctx, state, vp);

  // Target + decoys as map structures, each sitting in a little town.
  const bsize = Math.max(15, H * 0.042);
  for (const b of bomb.buildings) {
    const y = buildingScreenY(state, b, vp);
    if (y < -150 || y > H + 150) continue;
    const x = W / 2 + b.lane * W * 0.4;
    drawTownCluster(ctx, x, y, bsize, b.pos);
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawShape(ctx, b.shape, x + 4, y + 5, bsize, '#0e120c'); // drop shadow
    ctx.restore();
    drawShape(ctx, b.shape, x, y, bsize, b.isTarget ? '#39352c' : '#46473c');
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
