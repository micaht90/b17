// --- B-17G recognition-drawing station selector --------------------------------
// Accurate top-view (plan) silhouette of a B-17G, drawn on the 2D overlay canvas
// as the tappable station selector. Replaces the crude ellipse+rectangles
// diagram. Same hotspot protocol as before:
//   const hs = drawB17Diagram(ctx, diagramLayout(W, H), { mode, threats, pulse, t });
//   ...hit-test with Math.hypot(x - h.sx, y - h.sy) <= h.r
// Pure canvas 2D — no three.js, and no DOM/window access at module scope, so it
// is safe to import anywhere; all drawing lives inside the exported functions.
//
// Geometry is normalized to fuselage length L (nose ny=0 .. tail ny=1, vertical,
// nose UP) and wingspan S = 1.396 * L (103ft 9in span vs 74ft 4in length),
// horizontal, centered — so the silhouette is wider than it is tall.

const SPAN_RATIO = 1.396;                           // wingspan / fuselage length
const OUTLINE = 'rgba(205,218,228,0.85)';           // 1.5px panel outline
const PANEL = 'rgba(22,32,42,0.26)';                // subtle interior panel lines

// --- Stations -------------------------------------------------------------------
// [id, nx (S units, +x = screen right = waistR), ny (L units, nose = 0)]
// waistL/waistR sit close to the spine (anatomically correct waist windows); the
// hotspot array keeps waistL first so ties in the overlap zone resolve left.
const STATIONS = [
  ['nose',    0.0,   0.03 ],                        // bombardier's plexiglass nose
  ['pilot',   0.0,   0.15 ],                        // cockpit
  ['top',     0.0,   0.295],                        // top turret (nudged aft so the dot clears the cockpit's)
  ['ball',    0.0,   0.455],                        // ball turret (belly)
  ['waistL', -0.06,  0.615],                        // player's left = screen left
  ['waistR',  0.06,  0.615],
  ['tail',    0.0,   0.975],                        // tail gunner
];
const LABEL = { nose: 'NOS', pilot: 'PLT', top: 'TOP', ball: 'BAL', waistL: 'LW', waistR: 'RW', tail: 'TAL' };
// [x offset (S), nacelle nose y (L), nacelle tail y (L)] — outboard pair sits aft
const ENGINES = [[-0.24, 0.27, 0.525], [-0.135, 0.24, 0.555], [0.135, 0.24, 0.555], [0.24, 0.27, 0.525]];
const EMPTY_SET = new Set();

// --- Layout ---------------------------------------------------------------------
// Recommended box (bottom-left anchored). The span fits the width; h leaves a
// little air above/below the plane inside the card.
export function diagramLayout(W, H) {
  const w = Math.max(150, Math.min(W * 0.24, 260));
  const h = w * 0.86;
  return { x: 12, y: H - h - 12, w, h };
}

// --- Main draw ------------------------------------------------------------------
// opts = { mode: active station id, threats: Set of station ids, pulse: 0..1,
//          t: seconds (prop spin) }. Returns hotspots [{ id, sx, sy, r }].
export function drawB17Diagram(ctx, box, opts) {
  const mode = opts && opts.mode;
  const threats = (opts && opts.threats) || EMPTY_SET;
  const pulse = (opts && opts.pulse) || 0;
  const t = (opts && opts.t) || 0;
  const { x, y, w, h } = box;
  const S = w * 0.92, L = S / SPAN_RATIO;            // plane size inside the card
  const cx = x + w / 2, ty = y + (h - L) / 2;        // centered vertically
  const hotspots = [];

  ctx.save();
  // backing card + title (same look as the rest of the overlay UI)
  ctx.fillStyle = 'rgba(8,12,16,0.5)'; rr(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(140,160,175,0.16)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#8aa0ad';
  ctx.font = `bold ${Math.max(9, Math.round(w * 0.055))}px "Courier New", monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('TAP A STATION', x + 2, y - 8);

  drawAirframe(ctx, cx, ty, S, L, t, true);

  // — station dots. pilot/top sit close together on a real B-17, so the dots
  // are drawn in three passes (discs, alert rings, labels) to keep every label
  // legible even where neighbouring discs overlap.
  const rDot = Math.max(11, w * 0.062);
  for (let i = 0; i < STATIONS.length; i++) {        // pass 1: discs
    const id = STATIONS[i][0];
    const sx = cx + STATIONS[i][1] * S, sy = ty + STATIONS[i][2] * L;
    const active = mode === id, threat = threats.has(id);
    ctx.beginPath(); ctx.arc(sx, sy, rDot, 0, Math.PI * 2);
    if (active) ctx.fillStyle = '#5fc77a';
    else if (threat) ctx.fillStyle = `rgba(230,${Math.round(70 + pulse * 40)},60,${0.55 + pulse * 0.45})`;
    else ctx.fillStyle = 'rgba(20,28,36,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = active ? '#cfe' : threat ? '#ffd0c8' : 'rgba(150,170,185,0.8)';
    ctx.stroke();
    hotspots.push({ id, sx, sy, r: rDot + 6 });
  }
  for (let i = 0; i < hotspots.length; i++) {        // pass 2: expanding alert rings
    const hp = hotspots[i];
    if (!threats.has(hp.id) || mode === hp.id) continue;
    ctx.beginPath(); ctx.arc(hp.sx, hp.sy, rDot + 3 + pulse * 4, 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(230,80,60,${0.6 * (1 - pulse)})`; ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(8, Math.round(rDot * 0.72))}px "Courier New", monospace`;
  for (let i = 0; i < hotspots.length; i++) {        // pass 3: labels on top
    const hp = hotspots[i];
    ctx.fillStyle = mode === hp.id ? '#08110a' : '#dfeaf2';
    ctx.fillText(LABEL[hp.id], hp.sx, hp.sy);
  }
  ctx.restore();
  return hotspots;
}

// Tiny silhouette (no card, no dots) at top-left (x, y), width w; height is
// w / 1.396. t spins the props.
export function drawMini(ctx, x, y, w, t) {
  drawAirframe(ctx, x + w / 2, y, w, w / SPAN_RATIO, t || 0, false);
}

// --- Airframe painter -----------------------------------------------------------
// full=true adds panel lines, insignia, cowl rings and fuselage frames.
function drawAirframe(ctx, cx, ty, S, L, t, full) {
  const grad = ctx.createLinearGradient(0, ty, 0, ty + L);  // weathered aluminum
  grad.addColorStop(0, '#96a1ab'); grad.addColorStop(1, '#717b85');

  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // — wings + tailplane (drop shadow lifts the plane off the card)
  ctx.fillStyle = grad;
  shadowOn(ctx); pathWings(ctx, cx, ty, S, L); ctx.fill(); shadowOff(ctx);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  shadowOn(ctx); pathStab(ctx, cx, ty, S, L); ctx.fill(); shadowOff(ctx);
  ctx.stroke();

  if (full) {
    // — panel lines: forward spar, flap/aileron hinge + break, ribs, elevator
    ctx.strokeStyle = PANEL; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = -1; s <= 1; s += 2) {
      ctx.moveTo(cx + s * 0.05 * S, ty + 0.378 * L);  ctx.lineTo(cx + s * 0.44 * S, ty + 0.4415 * L); // spar
      ctx.moveTo(cx + s * 0.05 * S, ty + 0.481 * L);  ctx.lineTo(cx + s * 0.46 * S, ty + 0.482 * L);  // hinge line
      ctx.moveTo(cx + s * 0.27 * S, ty + 0.4815 * L); ctx.lineTo(cx + s * 0.27 * S, ty + 0.5215 * L); // flap/aileron break
      ctx.moveTo(cx + s * 0.19 * S, ty + 0.366 * L);  ctx.lineTo(cx + s * 0.19 * S, ty + 0.521 * L);  // ribs
      ctx.moveTo(cx + s * 0.30 * S, ty + 0.393 * L);  ctx.lineTo(cx + s * 0.30 * S, ty + 0.511 * L);
      ctx.moveTo(cx + s * 0.41 * S, ty + 0.420 * L);  ctx.lineTo(cx + s * 0.41 * S, ty + 0.500 * L);
      ctx.moveTo(cx + s * 0.015 * S, ty + 0.911 * L); ctx.lineTo(cx + s * 0.140 * S, ty + 0.908 * L); // elevator
    }
    ctx.stroke();
    // — faded star-in-circle insignia on the LEFT wing
    ctx.beginPath(); ctx.arc(cx - 0.30 * S, ty + 0.452 * L, 0.040 * S, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(46,70,116,0.55)'; ctx.fill();
    pathStar(ctx, cx - 0.30 * S, ty + 0.452 * L, 0.036 * S, 0.0148 * S);
    ctx.fillStyle = 'rgba(230,236,242,0.78)'; ctx.fill();
  }

  // — engine nacelles (forward of the leading edge, trailing back over the wing)
  for (let k = 0; k < 4; k++) {
    const e = ENGINES[k];
    pathNacelle(ctx, cx + e[0] * S, ty, S, L, e[1], e[2]);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
    if (full) {                                      // cowl flap ring
      ctx.strokeStyle = PANEL; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + (e[0] - 0.017) * S, ty + (e[1] + 0.05) * L);
      ctx.lineTo(cx + (e[0] + 0.017) * S, ty + (e[1] + 0.05) * L);
      ctx.stroke();
    }
  }
  // — translucent spinning prop discs + spinners
  for (let k = 0; k < 4; k++) {
    const e = ENGINES[k];
    const px = cx + e[0] * S, py = ty + (e[1] - 0.008) * L, r = 0.055 * S;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210,224,238,0.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(210,224,238,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(225,235,245,0.25)'; ctx.lineWidth = Math.max(1, S * 0.006);
    ctx.beginPath();
    for (let b = 0; b < 3; b++) {                    // 3 thin blades
      const a = t * 8 + k * 0.9 + b * (Math.PI * 2 / 3);
      ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * r * 0.95, py + Math.sin(a) * r * 0.95);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 0.008 * S, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,48,56,0.9)'; ctx.fill();
  }

  // — fuselage on top (covers wing/stab roots; its shadow adds depth over wings)
  ctx.fillStyle = grad;
  shadowOn(ctx); pathFuselage(ctx, cx, ty, S, L); ctx.fill(); shadowOff(ctx);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();

  // — signature dorsal fin fillet: slim wedge widening along the spine
  ctx.beginPath();
  ctx.moveTo(cx, ty + 0.655 * L);
  ctx.lineTo(cx + 0.011 * S, ty + 0.955 * L);
  ctx.lineTo(cx - 0.011 * S, ty + 0.955 * L);
  ctx.closePath();
  ctx.fillStyle = 'rgba(52,62,72,0.30)'; ctx.fill();
  // — fin/rudder cap crossing the extreme tail
  rr(ctx, cx - 0.0225 * S, ty + 0.958 * L, 0.045 * S, 0.042 * L, Math.min(0.021 * L, 0.02 * S));
  ctx.fillStyle = '#7d8791'; ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(24,34,44,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, ty + 0.962 * L); ctx.lineTo(cx, ty + 0.996 * L); ctx.stroke(); // rudder split

  // — glazed plexiglass nose dome with framing
  ctx.beginPath();
  ctx.moveTo(cx - 0.0232 * S, ty + 0.048 * L);
  ctx.bezierCurveTo(cx - 0.0236 * S, ty + 0.016 * L, cx - 0.012 * S, ty + 0.0015 * L, cx, ty + 0.0015 * L);
  ctx.bezierCurveTo(cx + 0.012 * S, ty + 0.0015 * L, cx + 0.0236 * S, ty + 0.016 * L, cx + 0.0232 * S, ty + 0.048 * L);
  ctx.closePath();
  ctx.fillStyle = 'rgba(160,198,224,0.35)'; ctx.fill();
  ctx.strokeStyle = 'rgba(45,60,75,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, ty + 0.006 * L); ctx.lineTo(cx, ty + 0.046 * L); ctx.stroke(); // mullion

  if (full) {                                        // fuselage frames every ~0.08L
    ctx.strokeStyle = PANEL; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let ny = 0.10; ny < 0.92; ny += 0.08) {
      const hw = fuseHalfW(ny) * 0.9 * S, fy = ty + ny * L;
      ctx.moveTo(cx - hw, fy); ctx.lineTo(cx + hw, fy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// --- Silhouette paths (all coords in S horizontally, L vertically) ---------------
function pathFuselage(c, cx, ty, S, L) {
  c.beginPath();
  c.moveTo(cx, ty);                                                                          // nose tip
  c.bezierCurveTo(cx + 0.026 * S, ty + 0.004 * L, cx + 0.038 * S, ty + 0.045 * L, cx + 0.040 * S, ty + 0.100 * L); // blunt glazed nose
  c.quadraticCurveTo(cx + 0.041 * S, ty + 0.135 * L, cx + 0.041 * S, ty + 0.170 * L);        // max width at cockpit
  c.lineTo(cx + 0.0405 * S, ty + 0.550 * L);                                                 // near-cylindrical midbody
  c.bezierCurveTo(cx + 0.037 * S, ty + 0.720 * L, cx + 0.019 * S, ty + 0.880 * L, cx + 0.010 * S, ty + 0.965 * L); // smooth taper
  c.quadraticCurveTo(cx + 0.010 * S, ty + 0.992 * L, cx, ty + L);                            // rounded tail cone
  c.quadraticCurveTo(cx - 0.010 * S, ty + 0.992 * L, cx - 0.010 * S, ty + 0.965 * L);
  c.bezierCurveTo(cx - 0.019 * S, ty + 0.880 * L, cx - 0.037 * S, ty + 0.720 * L, cx - 0.0405 * S, ty + 0.550 * L);
  c.lineTo(cx - 0.041 * S, ty + 0.170 * L);
  c.quadraticCurveTo(cx - 0.041 * S, ty + 0.135 * L, cx - 0.040 * S, ty + 0.100 * L);
  c.bezierCurveTo(cx - 0.038 * S, ty + 0.045 * L, cx - 0.026 * S, ty + 0.004 * L, cx, ty);
  c.closePath();
}

// Both wings in one path; root edges hide under the fuselage drawn on top.
// LE sweeps back root->tip (0.315L -> 0.435L), TE nearly straight (0.545 -> 0.50),
// well-rounded tips, small trailing-edge root fillet.
function pathWings(c, cx, ty, S, L) {
  c.beginPath();
  c.moveTo(cx + 0.016 * S, ty + 0.315 * L);                                                  // LE root
  c.lineTo(cx + 0.458 * S, ty + 0.425 * L);                                                  // swept leading edge
  c.bezierCurveTo(cx + 0.487 * S, ty + 0.4325 * L, cx + 0.5 * S, ty + 0.448 * L, cx + 0.5 * S, ty + 0.4675 * L); // rounded tip
  c.bezierCurveTo(cx + 0.5 * S, ty + 0.485 * L, cx + 0.488 * S, ty + 0.4965 * L, cx + 0.460 * S, ty + 0.504 * L);
  c.lineTo(cx + 0.058 * S, ty + 0.5415 * L);                                                 // trailing edge
  c.quadraticCurveTo(cx + 0.028 * S, ty + 0.545 * L, cx + 0.018 * S, ty + 0.578 * L);        // root fillet
  c.lineTo(cx - 0.018 * S, ty + 0.578 * L);
  c.quadraticCurveTo(cx - 0.028 * S, ty + 0.545 * L, cx - 0.058 * S, ty + 0.5415 * L);
  c.lineTo(cx - 0.460 * S, ty + 0.504 * L);
  c.bezierCurveTo(cx - 0.488 * S, ty + 0.4965 * L, cx - 0.5 * S, ty + 0.485 * L, cx - 0.5 * S, ty + 0.4675 * L);
  c.bezierCurveTo(cx - 0.5 * S, ty + 0.448 * L, cx - 0.487 * S, ty + 0.4325 * L, cx - 0.458 * S, ty + 0.425 * L);
  c.lineTo(cx - 0.016 * S, ty + 0.315 * L);
  c.closePath();
}

// Horizontal stabilizer: span 0.33S, LE 0.855L (root) -> 0.885L (tip), TE 0.945L.
function pathStab(c, cx, ty, S, L) {
  c.beginPath();
  c.moveTo(cx + 0.010 * S, ty + 0.855 * L);
  c.lineTo(cx + 0.148 * S, ty + 0.884 * L);
  c.bezierCurveTo(cx + 0.161 * S, ty + 0.8865 * L, cx + 0.165 * S, ty + 0.893 * L, cx + 0.165 * S, ty + 0.900 * L); // rounded tip
  c.bezierCurveTo(cx + 0.165 * S, ty + 0.9095 * L, cx + 0.159 * S, ty + 0.920 * L, cx + 0.144 * S, ty + 0.9265 * L);
  c.lineTo(cx + 0.012 * S, ty + 0.944 * L);
  c.lineTo(cx - 0.012 * S, ty + 0.944 * L);
  c.lineTo(cx - 0.144 * S, ty + 0.9265 * L);
  c.bezierCurveTo(cx - 0.159 * S, ty + 0.920 * L, cx - 0.165 * S, ty + 0.9095 * L, cx - 0.165 * S, ty + 0.900 * L);
  c.bezierCurveTo(cx - 0.165 * S, ty + 0.893 * L, cx - 0.161 * S, ty + 0.8865 * L, cx - 0.148 * S, ty + 0.884 * L);
  c.lineTo(cx - 0.010 * S, ty + 0.855 * L);
  c.closePath();
}

// Rounded-nose lozenge, ~0.04S wide, nose at yN, tapered rounded tail at yB.
function pathNacelle(c, x0, ty, S, L, yN, yB) {
  c.beginPath();
  c.moveTo(x0 - 0.020 * S, ty + (yN + 0.030) * L);
  c.bezierCurveTo(x0 - 0.020 * S, ty + (yN + 0.008) * L, x0 - 0.011 * S, ty + yN * L, x0, ty + yN * L);
  c.bezierCurveTo(x0 + 0.011 * S, ty + yN * L, x0 + 0.020 * S, ty + (yN + 0.008) * L, x0 + 0.020 * S, ty + (yN + 0.030) * L);
  c.lineTo(x0 + 0.015 * S, ty + (yB - 0.012) * L);
  c.quadraticCurveTo(x0 + 0.014 * S, ty + yB * L, x0, ty + yB * L);
  c.quadraticCurveTo(x0 - 0.014 * S, ty + yB * L, x0 - 0.015 * S, ty + (yB - 0.012) * L);
  c.closePath();
}

// --- Small helpers ---------------------------------------------------------------
function pathStar(c, x, y, rOut, rIn) {             // 5-point star, one point up
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i & 1) ? rIn : rOut, a = -Math.PI / 2 + i * Math.PI / 5;
    if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
}

// Approximate fuselage half-width (S units) at ny — used for the frame ticks.
function fuseHalfW(ny) {
  if (ny <= 0.17) return 0.041 * Math.pow(Math.max(ny, 0.002) / 0.17, 0.45);
  if (ny <= 0.55) return 0.0405;
  const u = (ny - 0.55) / 0.45;
  return 0.0405 * (1 - u) * (1 - 0.35 * u) + 0.011 * u;
}

function shadowOn(c) { c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8; c.shadowOffsetY = 3; }
function shadowOff(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; }

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
