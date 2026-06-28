// 3D pilot cockpit: a detailed procedural instrument panel (drawn to a live
// canvas texture), green windscreen framing, glareshield, and a draggable
// throttle lever. Everything is parented to the camera so it stays in view.

import * as THREE from 'three';

export function createCockpit(camera) {
  const group = new THREE.Group();
  camera.add(group);

  // --- Instrument panel (live canvas texture) ---------------------------------
  const pcanvas = document.createElement('canvas');
  pcanvas.width = 1024; pcanvas.height = 512;
  const pctx = pcanvas.getContext('2d');
  const panelTex = new THREE.CanvasTexture(pcanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: panelTex }),
  );
  panel.position.set(0, -0.62, -1.25);
  panel.rotation.x = 0.62;
  group.add(panel);

  // --- Windscreen framing (green B-17 glazing) --------------------------------
  const frameMat = new THREE.MeshStandardMaterial({ color: '#3c4b3d', metalness: 0.2, roughness: 0.8 });
  const post = (w, h, x, y, z, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat);
    m.position.set(x, y, z); m.rotation.z = rz; group.add(m); return m;
  };
  post(0.07, 1.4, 0, 0.35, -1.3);        // center post
  post(0.12, 1.4, -1.05, 0.35, -1.25, 0.32); // left angled
  post(0.12, 1.4, 1.05, 0.35, -1.25, -0.32); // right angled
  // Glareshield hood just above the panel.
  const glare = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: '#11161a', roughness: 1 }));
  glare.position.set(0, -0.02, -1.15); glare.rotation.x = 0.3; group.add(glare);

  // --- Throttle quadrant + lever ----------------------------------------------
  const metal = new THREE.MeshStandardMaterial({ color: '#20262c', metalness: 0.6, roughness: 0.5 });
  const quadrant = new THREE.Group();
  quadrant.position.set(0.74, -0.5, -1.0);
  quadrant.rotation.x = 0.5;
  group.add(quadrant);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), metal);
  quadrant.add(base);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(0, 0.02, 0.12);
  quadrant.add(leverPivot);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 10), metal);
  lever.position.y = 0.17; leverPivot.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: '#b5402f', metalness: 0.3, roughness: 0.5 }));
  knob.position.y = 0.34; leverPivot.add(knob);
  // The knob is the grab target.
  knob.userData.grab = 'throttle';

  function setLeverAngle(frac) {
    leverPivot.rotation.x = -0.6 + frac * 1.2; // pushed forward = more power
  }

  function drawPanel(state) {
    drawInstrumentPanel(pctx, state);
    panelTex.needsUpdate = true;
  }

  return {
    group, panel, knob, drawPanel, setLeverAngle,
    grabbables: [knob],
  };
}

// --- 2D panel art -------------------------------------------------------------
function dial(ctx, cx, cy, r, frac, label, value, color) {
  ctx.save();
  ctx.fillStyle = '#0c1014';
  ctx.strokeStyle = '#39424b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // bezel ring
  ctx.strokeStyle = '#586470'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#9aa7b2'; ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = (-220 + i * 26) * Math.PI / 180;
    const r0 = i % 5 === 0 ? r * 0.74 : r * 0.84;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
    ctx.stroke();
  }
  const a = (-220 + Math.max(0, Math.min(1, frac)) * 260) * Math.PI / 180;
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dfeaf2'; ctx.textAlign = 'center';
  ctx.font = `bold ${r * 0.26}px "Courier New", monospace`;
  ctx.fillText(label, cx, cy + r * 0.5);
  ctx.fillStyle = '#9fb0bd'; ctx.font = `bold ${r * 0.22}px "Courier New", monospace`;
  ctx.fillText(value, cx, cy + r * 0.78);
  ctx.restore();
}

function light(ctx, x, y, w, h, on, label, col) {
  ctx.fillStyle = on ? col : '#2a3036';
  ctx.strokeStyle = '#454f57'; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? '#0b0e11' : '#7e8c99';
  ctx.textAlign = 'center'; ctx.font = `bold ${h * 0.4}px "Courier New", monospace`;
  ctx.fillText(label, x + w / 2, y + h * 0.62);
}

function drawInstrumentPanel(ctx, state) {
  const W = 1024, H = 512;
  // Riveted metal background.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#222a30'); g.addColorStop(1, '#161b20');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 28; y < H; y += 40) for (let x = 24; x < W; x += 52) {
    ctx.beginPath(); ctx.arc(x + (Math.floor(y / 40) % 2) * 26, y, 2, 0, Math.PI * 2); ctx.fill();
  }

  const m = state.mission || { cruiseAltitude: 25000, minAltitudeToProceed: 18000 };
  const dials = [
    [(state.throttle - 0.7) / 0.7, 'AIRSPEED', `${Math.round(state.throttle * 180)} mph`, '#5fc77a'],
    [state.altitude / m.cruiseAltitude, 'ALTITUDE', `${(state.altitude / 1000).toFixed(0)}k ft`, state.altitude < m.minAltitudeToProceed ? '#e0584a' : '#d7e3ec'],
    [state.fuel / 100, 'FUEL', `${Math.round(state.fuel)}%`, state.fuel > 30 ? '#5fc77a' : '#e6b84d'],
    [state.health / 100, 'AIRFRAME', `${Math.round(state.health)}%`, state.health > 40 ? '#5fc77a' : '#e0584a'],
  ];
  const r = 92, y = 200, x0 = 170, gap = 230;
  dials.forEach((d, i) => dial(ctx, x0 + i * gap, y, r, d[0], d[1], d[2], d[3]));

  // Warning lights.
  const ly = 360, lw = 200, lh = 56;
  light(ctx, x0 - 120, ly, lw, lh, state.fire, 'ENGINE FIRE', '#e0584a');
  light(ctx, x0 - 120 + 230, ly, lw, lh, state.leak, 'FUEL LEAK', '#e6b84d');
  light(ctx, x0 - 120 + 460, ly, lw, lh, state.enginesOut > 0, `ENG OUT ${state.enginesOut || 0}`, '#e0584a');

  ctx.fillStyle = '#9fb0bd'; ctx.textAlign = 'center';
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.fillText('THROTTLE  ' + Math.round(state.throttle * 100) + '%', 860, 250);
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
