// 2D overlay for the gun station: a riveted fuselage wall with a window cut
// out (the 3D world + gun show through), plus the corner HUD.

export function drawGunFrame(ctx, W, H, state) {
  ctx.clearRect(0, 0, W, H);

  // Window opening (rounded rect) — everything outside is fuselage metal.
  const mx = W * 0.1, my = H * 0.08;
  const ww = W - mx * 2, wh = H - my - H * 0.06;
  const r = Math.min(W, H) * 0.07;

  // Metal border via even-odd fill (full screen minus the window).
  const grd = ctx.createLinearGradient(0, 0, W * 0.2, H);
  grd.addColorStop(0, '#41484f'); grd.addColorStop(0.5, '#262c32'); grd.addColorStop(1, '#161b20');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  roundRectPath(ctx, mx, my, ww, wh, r, true); // reverse winding -> hole
  ctx.fill('evenodd');

  // Panel seams + rivets around the opening.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
  roundRectPath(ctx, mx, my, ww, wh, r);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  const rivetGap = Math.max(26, W * 0.03);
  for (let x = mx + 6; x <= mx + ww - 6; x += rivetGap) { rivet(ctx, x, my - 10); rivet(ctx, x, my + wh + 10); }
  for (let y = my + 6; y <= my + wh - 6; y += rivetGap) { rivet(ctx, mx - 10, y); rivet(ctx, mx + ww + 10, y); }
  // a few structural rivets out on the metal
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 30; y < H; y += 46) for (let x = 20; x < mx - 12; x += 40) rivet(ctx, x, y);
  for (let y = 30; y < H; y += 46) for (let x = mx + ww + 18; x < W; x += 40) rivet(ctx, x, y);

  drawHUD(ctx, W, H, state);
}

function drawHUD(ctx, W, H, state) {
  const pad = Math.max(8, W * 0.012);
  const fs = Math.max(13, H * 0.03);
  ctx.font = `bold ${fs}px "Courier New", monospace`;
  const rows = [
    ['TIME', state.time || '07:54'],
    ['ALT', `${Math.round(state.altitude).toLocaleString()} ft`],
    ['SPEED', `${Math.round(state.speed)} mph`],
    ['HEADING', String(Math.round(state.heading)).padStart(3, '0')],
  ];
  const bw = fs * 9.5, bh = fs * 1.4 * rows.length + pad;
  ctx.fillStyle = 'rgba(6,10,14,0.62)';
  roundRectPath(ctx, pad, pad, bw, bh, 6); ctx.fill();
  let y = pad + fs * 1.15;
  for (const [k, v] of rows) {
    ctx.fillStyle = '#9fb0bd'; ctx.textAlign = 'left'; ctx.fillText(k, pad + 8, y);
    ctx.fillStyle = '#e8f0f6'; ctx.textAlign = 'right'; ctx.fillText(v, pad + bw - 8, y);
    y += fs * 1.4;
  }
  // score
  ctx.fillStyle = '#e6b84d'; ctx.textAlign = 'left';
  ctx.fillText(`BANDITS DOWNED: ${state.score || 0}`, pad, H - pad);
  ctx.textAlign = 'left';
}

function rivet(ctx, x, y) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }

function roundRectPath(ctx, x, y, w, h, r, reverse) {
  ctx.moveTo(x + r, y);
  if (!reverse) {
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  } else {
    // reverse winding for an even-odd hole
    ctx.lineTo(x + r, y);
    ctx.arcTo(x, y, x, y + h, r);
    ctx.arcTo(x, y + h, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x + w, y, r);
    ctx.arcTo(x + w, y, x + r, y, r);
  }
}
