// Photographic B-17 cockpit: the real cockpit photo is the panel, with the
// windscreen sky chroma-keyed to transparent so the live 3D sky shows through.
// The photo is anchored high (panel low, big window) with a little overscan so
// you can look around with parallax. A clean flight-instrument cluster, a
// throttle lever and a control yoke are drawn cleanly on top.

let masked = null;     // canvas with windscreen cut out
let imgW = 0, imgH = 0;
let panorama = false;

export function loadCockpit(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      panorama = url.includes('expanded');
      imgW = img.naturalWidth; imgH = img.naturalHeight;
      if (url.includes('masked')) {
        masked = img;
        resolve();
        return;
      }
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
        if (yf < 0.02 || yf > (panorama ? 0.52 : 0.40)) continue;
        for (let xx = 0; xx < imgW; xx++) {
          const i = (y * imgW + xx) * 4;
          const r = p[i], g = p[i + 1], b = p[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const skyBlue = panorama && b > 78 && lum > 55 && b - Math.min(r, g) > 18;
          const brightSky = lum > 110 && b >= r - 24;
          if (panorama ? (skyBlue || brightSky) : brightSky) p[i + 3] = 0;
        }
      }
      x.putImageData(d, 0, 0);
      if (panorama) cutPanoramaWindows(x);
      if (!panorama) {
        // Hide the Google Lens UI baked into the bottom-left of the screenshot.
        x.fillStyle = '#0c0f0b';
        x.fillRect(imgW * 0.02, imgH * 0.83, imgW * 0.27, imgH * 0.16);
      }
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
  const hz = state ? (state.headZoom || 0) : 0;
  const base = panorama ? Math.max(W / imgW, H / imgH) : W / imgW;
  const OVER = (panorama ? 1.18 : 1.07) + hz * (panorama ? 0.08 : 0.045);
  const s = base * OVER;
  const w = imgW * s, h = imgH * s;
  const skyBand = panorama ? -H * 0.02 : H * 0.05;
  const lx = state ? (state.lookDX || 0) : 0, ly = state ? (state.lookDY || 0) : 0;
  const hx = state ? (state.headX || 0) : 0, hy = state ? (state.headY || 0) : 0;
  const xRange = Math.max(0, (w - W) / 2);
  const yMin = panorama ? -H * 0.2 : -skyBand;
  const yMax = panorama ? H * 0.1 : H * 0.18;
  const panX = clamp((-lx * (panorama ? 0.74 : 0.56) - hx * (panorama ? 0.58 : 0.26)) * W, -xRange, xRange);
  const panY = clamp((ly * 0.58 + hy * 0.22 - hz * 0.055) * H, yMin, yMax);
  const dx = (W - w) / 2 + panX;
  const dy = skyBand + panY;
  return { s, w, h, dx, dy, skyBand };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function cutPanoramaWindows(ctx) {
  const sx = imgW / 1699;
  const sy = imgH / 926;
  const windows = [
    [[58, 68], [242, 86], [218, 380], [39, 371], [25, 128]],
    [[300, 142], [389, 126], [374, 373], [282, 372]],
    [[428, 149], [750, 129], [821, 194], [819, 378], [439, 351]],
    [[855, 194], [924, 129], [1286, 148], [1260, 377], [855, 377]],
    [[1299, 127], [1392, 142], [1416, 373], [1312, 373]],
    [[1454, 85], [1637, 61], [1669, 363], [1486, 379]],
  ];

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const poly of windows) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => {
      const px = x * sx;
      const py = y * sy;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// A clean vertical throttle lever fixed to the right edge (independent of the
// photo so it is always reachable). Returns its hit rectangle.
export function throttleRectScreen(W, H) {
  const w = Math.max(54, W * 0.07);
  const x = W - w - Math.max(10, W * 0.018);
  const y = H * 0.40, h = H * 0.46;
  return { x, y, w, h };
}

export function headPadRectScreen(W, H) {
  const s = Math.max(78, Math.min(116, H * 0.19));
  return {
    x: Math.max(12, W * 0.018),
    y: Math.max(58, H * 0.115),
    w: s,
    h: s,
  };
}

export function draw(ctx, W, H, state) {
  ctx.clearRect(0, 0, W, H);
  drawPhotoTexture(ctx, W, H, state);
  drawInstruments(ctx, W, H, state);
  drawThrottle(ctx, W, H, state);
  drawHeadPad(ctx, W, H, state);
  drawYoke(ctx, W, H, state);
  drawCockpitVignette(ctx, W, H);
}

function cockpitView(W, H, state) {
  const lx = state ? (state.lookDX || 0) : 0;
  const ly = state ? (state.lookDY || 0) : 0;
  const hx = state ? (state.headX || 0) : 0;
  const hy = state ? (state.headY || 0) : 0;
  const hz = state ? (state.headZoom || 0) : 0;
  return {
    lx,
    ly,
    hx,
    hy,
    hz,
    drift: lx * W * 0.055 - hx * W * 0.065,
    rise: -ly * H * 0.12 - hy * H * 0.065 + hz * H * 0.035,
    lean: hx * W * 0.095,
    zoom: 1 + hz * 0.045,
  };
}

function drawPhotoTexture(ctx, W, H, state) {
  if (!masked) return;
  const L = layout(W, H, state);
  ctx.save();
  ctx.globalAlpha = 0.98;
  ctx.drawImage(masked, L.dx, L.dy, L.w, L.h);
  ctx.restore();
}

function drawGlassAndFrame(ctx, W, H, state, view) {
  const drift = view.drift;
  const rise = view.rise;
  const top = H * 0.045;
  const mid = H * 0.285 + rise * 0.25;
  const bot = H * 0.515 + rise * 0.55;

  ctx.save();
  // A subtle blue/amber plexiglass wash makes the live sky feel like it is
  // being seen through bomber glass instead of through a hard alpha cutout.
  const glass = ctx.createLinearGradient(0, top, W, bot);
  glass.addColorStop(0, 'rgba(154,196,226,0.11)');
  glass.addColorStop(0.58, 'rgba(236,242,230,0.065)');
  glass.addColorStop(1, 'rgba(255,214,142,0.065)');
  ctx.fillStyle = glass;
  panePath(ctx, W, H, drift, top, mid, bot);
  ctx.fill();

  const glow = ctx.createRadialGradient(W * 0.64, H * 0.13, 0, W * 0.64, H * 0.13, W * 0.28);
  glow.addColorStop(0, 'rgba(255,255,240,0.22)');
  glow.addColorStop(0.45, 'rgba(255,240,190,0.06)');
  glow.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(W * 0.28, 0, W * 0.62, H * 0.45);

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(1, W * 0.0015);
  for (let i = 0; i < 8; i++) {
    const y = H * (0.09 + i * 0.038);
    ctx.beginPath();
    ctx.moveTo(W * (0.14 + i * 0.015) + drift, y);
    ctx.lineTo(W * (0.36 + i * 0.02) + drift, y + H * 0.11);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(9,12,13,0.78)';
  ctx.lineWidth = Math.max(6, W * 0.008);
  ctx.lineCap = 'round';
  for (const x of [0.23, 0.38, 0.5, 0.62, 0.77]) {
    ctx.beginPath();
    ctx.moveTo(W * x + drift * 0.25, H * 0.035 + rise * 0.08);
    ctx.quadraticCurveTo(W * x + drift * 0.1, H * 0.21 + rise * 0.22, W * (x + (x < 0.5 ? -0.055 : x > 0.5 ? 0.055 : 0)) + drift * 0.1, bot);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(220,230,235,0.2)';
  ctx.lineWidth = Math.max(1.5, W * 0.0015);
  ctx.beginPath();
  ctx.moveTo(W * 0.07 + drift, H * 0.058 + rise * 0.06);
  ctx.bezierCurveTo(W * 0.28 + drift, H * 0.012 + rise * 0.04, W * 0.72 + drift, H * 0.012 + rise * 0.04, W * 0.93 + drift, H * 0.064 + rise * 0.06);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(6,8,10,0.72)';
  ctx.lineWidth = Math.max(8, W * 0.012);
  ctx.beginPath();
  ctx.moveTo(W * 0.055 + drift, H * 0.055 + rise * 0.05);
  ctx.bezierCurveTo(W * 0.27 + drift, H * 0.0 + rise * 0.04, W * 0.73 + drift, H * 0.0 + rise * 0.04, W * 0.945 + drift, H * 0.058 + rise * 0.05);
  ctx.stroke();

  drawFrameRivets(ctx, W, H, drift, bot);
  ctx.restore();
}

function panePath(ctx, W, H, drift, top, mid, bot) {
  ctx.beginPath();
  ctx.moveTo(W * 0.07 + drift, top);
  ctx.bezierCurveTo(W * 0.24 + drift, H * 0.074, W * 0.74 + drift, H * 0.056, W * 0.94 + drift, top + H * 0.022);
  ctx.lineTo(W * 0.915 + drift, bot);
  ctx.bezierCurveTo(W * 0.7 + drift, mid, W * 0.32 + drift, mid, W * 0.085 + drift, bot);
  ctx.closePath();
}

function drawFrameRivets(ctx, W, H, drift, bot) {
  ctx.fillStyle = 'rgba(210,220,226,0.22)';
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = W * (0.09 + 0.82 * t) + drift;
    const y = H * (0.062 + Math.sin(t * Math.PI) * -0.035);
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, W * 0.0014), 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    const y = H * 0.13 + i * (bot - H * 0.13) / 8;
    for (const x of [0.23, 0.77]) {
      ctx.beginPath(); ctx.arc(W * x + drift * 0.2, y, Math.max(1, W * 0.0012), 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawCabinStructure(ctx, W, H, state, view) {
  const drift = view.drift;
  const lean = view.lean;
  const base = H * 0.515 + view.rise * 0.5;
  ctx.save();
  const side = ctx.createLinearGradient(0, H * 0.2, 0, H);
  side.addColorStop(0, 'rgba(20,31,35,0.72)');
  side.addColorStop(1, 'rgba(5,8,10,0.9)');

  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.moveTo(-W * 0.05, H * 0.06);
  ctx.lineTo(W * 0.075 + drift + lean * 0.25, base);
  ctx.lineTo(W * 0.27 + lean * 0.15, H);
  ctx.lineTo(-W * 0.1, H);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(W * 1.05, H * 0.06);
  ctx.lineTo(W * 0.925 + drift + lean * 0.25, base);
  ctx.lineTo(W * 0.73 + lean * 0.15, H);
  ctx.lineTo(W * 1.1, H);
  ctx.closePath();
  ctx.fill();

  const brow = ctx.createLinearGradient(0, base - H * 0.08, 0, base + H * 0.05);
  brow.addColorStop(0, 'rgba(9,12,13,0.0)');
  brow.addColorStop(0.55, 'rgba(8,10,11,0.82)');
  brow.addColorStop(1, 'rgba(20,24,25,0.94)');
  ctx.fillStyle = brow;
  ctx.beginPath();
  ctx.moveTo(W * 0.045 + drift, base - H * 0.04);
  ctx.bezierCurveTo(W * 0.25 + drift, base + H * 0.025, W * 0.74 + drift, base + H * 0.025, W * 0.955 + drift, base - H * 0.04);
  ctx.lineTo(W, H * 0.64);
  ctx.lineTo(0, H * 0.64);
  ctx.closePath();
  ctx.fill();

  drawSideWindow(ctx, W, H, -1, view);
  drawSideWindow(ctx, W, H, 1, view);
  ctx.restore();
}

function drawSideWindow(ctx, W, H, side, view) {
  const x0 = side < 0 ? W * 0.035 + view.lean * 0.08 : W * 0.965 + view.lean * 0.08;
  const inset = W * 0.13;
  const dir = side < 0 ? 1 : -1;
  ctx.save();
  ctx.strokeStyle = 'rgba(11,14,16,0.75)';
  ctx.lineWidth = Math.max(5, W * 0.006);
  ctx.fillStyle = 'rgba(138,184,212,0.055)';
  ctx.beginPath();
  ctx.moveTo(x0, H * 0.23 + view.rise * 0.15);
  ctx.lineTo(x0 + dir * inset, H * 0.31 + view.rise * 0.2);
  ctx.lineTo(x0 + dir * inset * 0.78, H * 0.48 + view.rise * 0.35);
  ctx.lineTo(x0 + dir * W * 0.035, H * 0.55 + view.rise * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPanelTreatment(ctx, W, H, state, view) {
  ctx.save();
  const top = H * 0.49 + view.rise * 0.42;
  const wash = ctx.createLinearGradient(0, top, 0, H);
  wash.addColorStop(0, 'rgba(5,8,10,0.0)');
  wash.addColorStop(0.28, 'rgba(5,8,10,0.22)');
  wash.addColorStop(1, 'rgba(3,5,7,0.46)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, top, W, H - top);

  // Console brow around the clean instrument set; this makes the drawn gauges
  // feel mounted to the photo rather than floating over it.
  const bw = Math.min(W * 0.62, 780) * view.zoom;
  const bh = Math.max(92, H * 0.18) * view.zoom;
  const x = W * 0.5 - bw * 0.5 + view.lean * 0.18;
  const y = H - bh - Math.max(10, H * 0.018) + view.rise * 0.22;
  const panel = ctx.createLinearGradient(x, y, x, y + bh);
  panel.addColorStop(0, 'rgba(36,43,48,0.78)');
  panel.addColorStop(0.52, 'rgba(12,16,20,0.82)');
  panel.addColorStop(1, 'rgba(3,5,7,0.8)');
  ctx.fillStyle = panel;
  rr(ctx, x, y, bw, bh, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,205,215,0.24)';
  ctx.lineWidth = 1.5;
  rr(ctx, x, y, bw, bh, 12);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let i = 0; i < 3; i++) {
    rr(ctx, x + bw * (0.08 + i * 0.31), y + bh * 0.18, bw * 0.21, bh * 0.58, 8);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(230,238,244,0.18)';
  const screwY = y + bh * 0.18;
  for (let sx = x + 18; sx <= x + bw - 18; sx += Math.max(44, bw / 9)) {
    ctx.beginPath();
    ctx.arc(sx, screwY, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  const compassX = W * 0.5;
  const compassY = y - Math.max(12, H * 0.018);
  ctx.fillStyle = 'rgba(8,12,16,0.62)';
  rr(ctx, compassX - W * 0.095, compassY - 11, W * 0.19, 22, 4);
  ctx.fill();
  ctx.fillStyle = '#d9e4ea';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(10, H * 0.02)}px "Courier New", monospace`;
  ctx.fillText(`HDG ${String(Math.round(state.heading || 0)).padStart(3, '0')}  ALT ${Math.round((state.altitude || 0) / 1000)}K`, compassX, compassY + 5);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawCockpitVignette(ctx, W, H) {
  const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.46, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.72, 'rgba(0,0,0,0.16)');
  vg.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// --- Flight instrument cluster (clean, animated) -----------------------------
function drawInstruments(ctx, W, H, state) {
  const n = 5;
  const scale = 1 + (state.headZoom || 0) * 0.045;
  const rg = Math.max(28, Math.min(H * 0.07, W * 0.046)) * scale;
  const gap = rg * 2.5;
  const total = gap * (n - 1);
  const cx0 = W * 0.5 - total / 2 + W * 0.02 + (state.headX || 0) * W * 0.026;
  const cy = H - rg - Math.max(10, H * 0.04) + (state.headY || 0) * H * 0.02;

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
  drawSwitches(ctx, cx0 - rg * 1.55, cy + rg * 1.14, total + rg * 3.1, rg * 0.48, state);
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

function drawHeadPad(ctx, W, H, state) {
  const r = headPadRectScreen(W, H);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const knobX = cx + (state.headX || 0) * r.w * 0.32;
  const knobY = cy - (state.headY || 0) * r.h * 0.32;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,16,0.46)';
  rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(180,196,205,0.35)';
  ctx.lineWidth = 1.5;
  rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();

  ctx.strokeStyle = 'rgba(220,232,240,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, r.y + r.h * 0.18); ctx.lineTo(cx, r.y + r.h * 0.82);
  ctx.moveTo(r.x + r.w * 0.18, cy); ctx.lineTo(r.x + r.w * 0.82, cy);
  ctx.stroke();

  ctx.fillStyle = '#8aa0ad';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(8, r.w * 0.12)}px "Courier New", monospace`;
  ctx.fillText('HEAD', cx, r.y + r.h * 0.18);

  const glow = ctx.createRadialGradient(knobX - r.w * 0.06, knobY - r.w * 0.06, 1, knobX, knobY, r.w * 0.17);
  glow.addColorStop(0, '#eaf2f8');
  glow.addColorStop(1, '#6f8797');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(knobX, knobY, Math.max(8, r.w * 0.095), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(4,6,8,0.7)';
  ctx.stroke();

  const z = clamp(((state.headZoom || 0) + 1) / 2, 0, 1);
  const zx = r.x + r.w * 0.16, zy = r.y + r.h * 0.86, zw = r.w * 0.68, zh = Math.max(4, r.h * 0.045);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  rr(ctx, zx, zy, zw, zh, 3); ctx.fill();
  ctx.fillStyle = '#e6b84d';
  rr(ctx, zx, zy, zw * z, zh, 3); ctx.fill();
  ctx.restore();
}

function drawSwitches(ctx, x, y, w, h, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,9,12,0.5)';
  rr(ctx, x, y, w, h, 6); ctx.fill();
  const count = 12;
  for (let i = 0; i < count; i++) {
    const sx = x + w * (0.08 + i * 0.84 / (count - 1));
    const on = (i % 4 === 0) || (i === 8 && (state.throttle || 1) > 1.08);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    rr(ctx, sx - h * 0.16, y + h * 0.18, h * 0.32, h * 0.64, 3); ctx.fill();
    ctx.fillStyle = on ? '#d9e4ea' : '#6f7f89';
    rr(ctx, sx - h * 0.065, y + h * (on ? 0.18 : 0.42), h * 0.13, h * 0.34, 2); ctx.fill();
  }
  ctx.fillStyle = '#8aa0ad';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(7, h * 0.32)}px "Courier New", monospace`;
  ctx.fillText('OXY     HEAT     GEAR     FLAPS     TRIM', x + w / 2, y + h * 1.22);
  ctx.restore();
}

// --- Control yoke (B-17 ram's-horn wheel) ------------------------------------
function drawYoke(ctx, W, H, state) {
  const cx = W * 0.5 + (state.headX || 0) * W * 0.035;
  const r = Math.max(40, W * 0.06) * (1 + (state.headZoom || 0) * 0.035);
  const climb = state.climb || 0;
  const turn = (state.lookDX || 0) * 0.6;
  const rise = climb * H * 0.05 - (state.headY || 0) * H * 0.018;
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
