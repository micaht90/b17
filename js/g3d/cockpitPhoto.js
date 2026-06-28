// Photographic B-17 cockpit: the real cockpit photo is used as the panel, with
// the windscreen sky chroma-keyed to transparent so the live 3D sky shows
// through it. Live readouts + a draggable throttle handle are overlaid.

let masked = null;     // canvas with windscreen cut out
let imgW = 0, imgH = 0;

// Throttle quadrant region within the photo (normalized 0..1), and the lever
// travel (forward/up = full power, back/down = idle).
const THR = { x0: 0.45, x1: 0.67, y0: 0.58, yIdle: 0.93, yFull: 0.6 };

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
      // Cut the windscreen: bright, blue-ish pixels in the upper band -> clear.
      for (let y = 0; y < imgH; y++) {
        const yf = y / imgH;
        if (yf < 0.04 || yf > 0.345) continue;
        for (let xx = 0; xx < imgW; xx++) {
          const i = (y * imgW + xx) * 4;
          const r = p[i], g = p[i + 1], b = p[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 110 && b >= r - 14) p[i + 3] = 0;
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

// Fit the photo to the screen height, centered, so the full panel + throttle
// always show; the side gaps are filled as dark fuselage.
function layout(W, H) {
  const s = H / imgH;
  const w = imgW * s;
  return { s, w, h: H, dx: (W - w) / 2, dy: 0 };
}

export function throttleRectScreen(W, H) {
  const L = layout(W, H);
  return {
    x: L.dx + THR.x0 * L.w, y: L.dy + THR.y0 * L.h,
    w: (THR.x1 - THR.x0) * L.w, h: (THR.yIdle - THR.y0) * L.h, L,
  };
}

export function draw(ctx, W, H, state) {
  if (!masked) return;
  const L = layout(W, H);
  ctx.clearRect(0, 0, W, H);
  // Dark fuselage in the side gaps (don't cover the windscreen — it's inside
  // the photo and stays transparent so the 3D sky shows through).
  ctx.fillStyle = '#05070a';
  if (L.dx > 0) { ctx.fillRect(0, 0, L.dx + 1, H); ctx.fillRect(L.dx + L.w - 1, 0, W - (L.dx + L.w) + 1, H); }
  ctx.drawImage(masked, L.dx, L.dy, L.w, L.h);

  // Throttle handle (drag target) drawn over the quadrant.
  const frac = (state.throttle - 0.7) / 0.7;            // 0..1
  const hy = L.dy + (THR.yIdle + (THR.yFull - THR.yIdle) * frac) * L.h;
  const hx = L.dx + ((THR.x0 + THR.x1) / 2) * L.w;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#d24636';
  ctx.beginPath(); ctx.ellipse(hx, hy, Math.max(16, W * 0.018), Math.max(11, W * 0.012), 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ff7a68'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // Live readouts (top-left), styled like the reference HUD.
  const pad = Math.max(8, W * 0.012);
  const fs = Math.max(13, H * 0.03);
  ctx.font = `bold ${fs}px "Courier New", monospace`;
  const lines = [
    ['SPEED', `${Math.round(state.throttle * 180)} mph`],
    ['ALT', `${Math.round(state.altitude).toLocaleString()} ft`],
    ['FUEL', `${Math.round(state.fuel)}%`],
    ['HULL', `${Math.round(state.health)}%`],
  ];
  const bw = fs * 9, bh = fs * 1.45 * lines.length + pad;
  ctx.fillStyle = 'rgba(6,10,14,0.6)';
  roundRect(ctx, pad, pad, bw, bh, 6); ctx.fill();
  let y = pad + fs * 1.2;
  for (const [k, v] of lines) {
    ctx.fillStyle = '#9fb0bd'; ctx.textAlign = 'left'; ctx.fillText(k, pad + 8, y);
    ctx.fillStyle = '#e8f0f6'; ctx.textAlign = 'right'; ctx.fillText(v, pad + bw - 8, y);
    y += fs * 1.45;
  }
  ctx.textAlign = 'left';

  // Throttle % label by the quadrant.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `bold ${Math.max(12, H * 0.026)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`THROTTLE ${Math.round(state.throttle * 100)}%`, hx, L.dy + L.h * 0.55);
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
