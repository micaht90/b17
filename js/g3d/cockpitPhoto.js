// Photographic B-17 cockpit: the real cockpit photo is the panel, with the
// windscreen sky chroma-keyed to transparent so the live 3D sky shows through.
// The photo is anchored high (panel low, big window) with a little overscan so
// you can look around with parallax. A clean flight-instrument cluster, a
// throttle lever and a control yoke are drawn cleanly on top.

let masked = null;     // canvas with windscreen cut out
let imgW = 0, imgH = 0;

export function loadCockpit(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imgW = img.naturalWidth; imgH = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = imgW; c.height = imgH;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, imgW, imgH);
      const p = d.data;
      // Cut the windscreen glass: bright, blue-ish pixels in the upper band so
      // the live 3D sky shows through. A widened band makes a bigger window.
      for (let y = 0; y < imgH; y++) {
        const yf = y / imgH;
        if (yf < 0.02 || yf > 0.40) continue;
        for (let xx = 0; xx < imgW; xx++) {
          const i = (y * imgW + xx) * 4;
          const r = p[i], g = p[i + 1], b = p[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 98 && b >= r - 20) p[i + 3] = 0;
        }
      }
      x.putImageData(d, 0, 0);
      // Hide the Google Lens UI baked into the bottom-left of the screenshot.
      x.fillStyle = '#0c0f0b';
      x.fillRect(imgW * 0.02, imgH * 0.83, imgW * 0.27, imgH * 0.16);
      masked = c;
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Fit the photo to the screen width (no side gaps) with a little overscan so it
// can pan for look-around, anchored high so the windscreen sits up top with a
// strip of open sky above it and the panel pushed low.
function layout(W, H, state) {
  const OVER = 1.07;                       // horizontal overscan for look-around
  const s = (W / imgW) * OVER;
  const w = imgW * s, h = imgH * s;
  const skyBand = H * 0.05;                // open 3D sky revealed above the roof
  const lx = state ? (state.lookDX || 0) : 0, ly = state ? (state.lookDY || 0) : 0;
  const panX = clamp(-lx * W * 0.5, -(w - W) / 2, (w - W) / 2);
  const panY = clamp(ly * H * 0.6, -skyBand, H * 0.18);
  const dx = (W - w) / 2 + panX;
  const dy = skyBand + panY;
  return { s, w, h, dx, dy, skyBand };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// A clean vertical throttle lever fixed to the right edge (independent of the
// photo so it is always reachable). Returns its hit rectangle.
export function throttleRectScreen(W, H) {
  const w = Math.max(54, W * 0.07);
  const x = W - w - Math.max(10, W * 0.018);
  const y = H * 0.40, h = H * 0.46;
  return { x, y, w, h };
}

export function draw(ctx, W, H, state) {
  if (!masked) return;
  ctx.clearRect(0, 0, W, H);
  const L = layout(W, H, state);
  ctx.drawImage(masked, L.dx, L.dy, L.w, L.h);
  drawInstruments(ctx, W, H, state);
  drawThrottle(ctx, W, H, state);
  drawYoke(ctx, W, H, state);
}

// --- Flight instrument cluster (clean, animated) -----------------------------
function drawInstruments(ctx, W, H, state) {
  const n = 5;
  const rg = Math.max(28, Math.min(H * 0.07, W * 0.046));
  const gap = rg * 2.5;
  const total = gap * (n - 1);
  const cx0 = W * 0.5 - total / 2 + W * 0.02;     // nudge right, clear of diagram
  const cy = H - rg - Math.max(10, H * 0.04);

  const pad = rg * 0.7;
  ctx.fillStyle = 'rgba(8,12,16,0.5)';
  rr(ctx, cx0 - rg - pad, cy - rg - pad * 0.6, total + (rg + pad) * 2, (rg + pad) * 2 - pad * 0.4, 12);
  ctx.fill();

  const speed = Math.round(state.speed || 0);
  const alt = Math.round(state.altitude || 0);
  const hdg = Math.round(state.heading || 0);
  const rpm = Math.round(1500 + (state.throttle || 1) * 850);
  const pitch = (state.lookDY || 0) + (state.climb || 0);
  const bank = (state.lookDX || 0) * 0.8;

  gaugeAirspeed(ctx, cx0 + gap * 0, cy, rg, speed);
  gaugeHorizon(ctx, cx0 + gap * 1, cy, rg, pitch, bank);
  gaugeAltimeter(ctx, cx0 + gap * 2, cy, rg, alt);
  gaugeHeading(ctx, cx0 + gap * 3, cy, rg, hdg);
  gaugeRPM(ctx, cx0 + gap * 4, cy, rg, rpm);
}

function gaugeFace(ctx, x, y, r) {
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, '#1b2128'); g.addColorStop(1, '#0c1014');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = '#2c3742'; ctx.stroke();
  ctx.restore();
}
function ticks(ctx, x, y, r, count, from = -Math.PI * 1.25, to = Math.PI * 0.25) {
  ctx.strokeStyle = 'rgba(220,232,240,0.7)'; ctx.lineWidth = Math.max(1, r * 0.04);
  for (let i = 0; i <= count; i++) {
    const a = from + (to - from) * (i / count);
    const r1 = r * 0.82, r2 = i % 2 === 0 ? r * 0.66 : r * 0.74;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    ctx.stroke();
  }
}
function needle(ctx, x, y, r, ang, col = '#eef4f8', len = 0.78, wid = 0.06) {
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, r * wid); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * r * 0.18, y - Math.sin(ang) * r * 0.18);
  ctx.lineTo(x + Math.cos(ang) * r * len, y + Math.sin(ang) * r * len); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function gaugeLabel(ctx, x, y, r, label, value) {
  ctx.fillStyle = '#8aa0ad'; ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(8, r * 0.26)}px "Courier New", monospace`;
  ctx.fillText(label, x, y - r * 0.34);
  ctx.fillStyle = '#eef6fb'; ctx.font = `bold ${Math.max(9, r * 0.30)}px "Courier New", monospace`;
  ctx.fillText(value, x, y + r * 0.5);
  ctx.textAlign = 'left';
}
function gaugeAirspeed(ctx, x, y, r, mph) {
  gaugeFace(ctx, x, y, r); ticks(ctx, x, y, r, 8);
  const a = -Math.PI * 1.25 + (Math.PI * 1.5) * Math.min(1, mph / 300);
  needle(ctx, x, y, r, a, '#ffd27a'); gaugeLabel(ctx, x, y, r, 'SPEED', `${mph}`);
}
function gaugeAltimeter(ctx, x, y, r, ft) {
  gaugeFace(ctx, x, y, r); ticks(ctx, x, y, r, 10);
  const a = -Math.PI / 2 + (ft % 10000) / 10000 * Math.PI * 2;
  needle(ctx, x, y, r, a, '#eef4f8'); gaugeLabel(ctx, x, y, r, 'ALT', `${(ft / 1000).toFixed(0)}k`);
}
function gaugeHeading(ctx, x, y, r, deg) {
  gaugeFace(ctx, x, y, r);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-deg * Math.PI / 180);
  ctx.fillStyle = '#cfe0ee'; ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(8, r * 0.3)}px "Courier New", monospace`;
  const dirs = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2; ctx.fillText(dirs[i], Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6 + r * 0.1); }
  ctx.restore();
  needle(ctx, x, y, r, -Math.PI / 2, '#ff6a5a', 0.7);
  gaugeLabel(ctx, x, y, r, 'HDG', String(deg).padStart(3, '0'));
}
function gaugeRPM(ctx, x, y, r, rpm) {
  gaugeFace(ctx, x, y, r); ticks(ctx, x, y, r, 8);
  const a = -Math.PI * 1.25 + (Math.PI * 1.5) * Math.min(1, rpm / 2600);
  needle(ctx, x, y, r, a, '#8fe0a0'); gaugeLabel(ctx, x, y, r, 'RPM', `${rpm}`);
}
function gaugeHorizon(ctx, x, y, r, pitch, bank) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y); ctx.rotate(bank);
  const off = clamp(pitch * r * 1.6, -r, r);
  ctx.fillStyle = '#4f86c6'; ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6 + off);
  ctx.fillStyle = '#7a5a36'; ctx.fillRect(-r * 1.6, off, r * 3.2, r * 1.6);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath(); ctx.moveTo(-r * 1.2, off); ctx.lineTo(r * 1.2, off); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x - r * 0.15, y);
  ctx.moveTo(x + r * 0.15, y); ctx.lineTo(x + r * 0.5, y); ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = '#2c3742';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#8aa0ad'; ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(8, r * 0.24)}px "Courier New", monospace`;
  ctx.fillText('ATTITUDE', x, y + r * 0.86); ctx.textAlign = 'left';
}

// --- Throttle lever ----------------------------------------------------------
function drawThrottle(ctx, W, H, state) {
  const r = throttleRectScreen(W, H);
  const cx = r.x + r.w / 2;
  const top = r.y + r.w * 0.4, bot = r.y + r.h - r.w * 0.4;
  ctx.fillStyle = 'rgba(8,12,16,0.5)'; rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
  ctx.fillStyle = '#8aa0ad'; ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(9, W * 0.011)}px "Courier New", monospace`;
  ctx.fillText('THR', cx, r.y - 4);
  ctx.fillText(`${Math.round((state.throttle || 1) * 100)}%`, cx, r.y + r.h + Math.max(12, W * 0.014));
  ctx.strokeStyle = 'rgba(230,238,245,0.35)'; ctx.lineWidth = Math.max(3, W * 0.004); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bot); ctx.stroke();
  const frac = clamp(((state.throttle || 1) - 0.7) / 0.7, 0, 1);
  const hy = bot + (top - bot) * frac;
  ctx.strokeStyle = '#1c2026'; ctx.lineWidth = Math.max(7, W * 0.012);
  ctx.beginPath(); ctx.moveTo(cx, bot); ctx.lineTo(cx, hy); ctx.stroke();
  const rr2 = Math.max(15, r.w * 0.34);
  const grd = ctx.createRadialGradient(cx - rr2 * 0.3, hy - rr2 * 0.3, rr2 * 0.2, cx, hy, rr2);
  grd.addColorStop(0, '#ff7a68'); grd.addColorStop(1, '#b5362a');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(cx, hy, rr2, rr2 * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left';
}

// --- Control yoke (B-17 ram's-horn wheel) ------------------------------------
function drawYoke(ctx, W, H, state) {
  const cx = W * 0.5;
  const r = Math.max(40, W * 0.06);
  const climb = state.climb || 0;
  const turn = (state.lookDX || 0) * 0.6;
  const rise = climb * H * 0.05;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.translate(cx, H + H * 0.02 - r * 1.2 - rise);
  ctx.rotate(turn);
  ctx.strokeStyle = '#11151a'; ctx.lineWidth = Math.max(7, r * 0.18); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, r * 1.1); ctx.lineTo(0, r * 0.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.lineWidth = Math.max(4, r * 0.1);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
