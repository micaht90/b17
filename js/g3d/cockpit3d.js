// 3D pilot cockpit: a detailed B-17 dashboard (procedural, on a live canvas
// texture) with a six-pack + engine gauges, placards and switch rows, a
// glareshield hood, a control yoke, green windscreen framing, and a draggable
// throttle pedestal. Parented to the camera so it stays in view.

import * as THREE from 'three';

const PANEL_W = 2048, PANEL_H = 1024;

// Live-gauge anchor points (canvas px) — must match the static faces below.
const LIVE = {
  airspeed: { cx: 360, cy: 250, r: 125 },
  altitude: { cx: 830, cy: 250, r: 125 },
  fuel:     { cx: 1360, cy: 250, r: 125 },
  airframe: { cx: 1690, cy: 250, r: 125 },
};

export function createCockpit(camera) {
  const group = new THREE.Group();
  camera.add(group);

  // --- Live instrument panel (static art + live needles) ----------------------
  const staticCanvas = buildStaticPanel();
  const pcanvas = document.createElement('canvas');
  pcanvas.width = PANEL_W; pcanvas.height = PANEL_H;
  const pctx = pcanvas.getContext('2d');
  const panelTex = new THREE.CanvasTexture(pcanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;

  // Instrument panel: a wide plane tilted back toward the pilot, filling the
  // lower view and meeting the windscreen base.
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.0),
    new THREE.MeshBasicMaterial({ map: panelTex, side: THREE.DoubleSide }),
  );
  panel.position.set(0, -0.62, -1.05);
  panel.rotation.x = -1.04;                 // face up toward the seated pilot
  group.add(panel);


  // --- Windscreen framing (green B-17 glazing) --------------------------------
  const frameMat = new THREE.MeshStandardMaterial({ color: '#3b4a3c', roughness: 0.7, metalness: 0.2 });
  function bar(w, h, d, x, y, z, rz = 0, rx = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(x, y, z); m.rotation.z = rz; m.rotation.x = rx; group.add(m); return m;
  }
  bar(0.1, 1.7, 0.1, 0, 0.55, -1.5);          // center post
  bar(0.14, 1.8, 0.1, -1.15, 0.5, -1.45, 0.3); // left A-pillar
  bar(0.14, 1.8, 0.1, 1.15, 0.5, -1.45, -0.3); // right A-pillar
  bar(3.4, 0.16, 0.1, 0, 1.32, -1.45);         // top frame

  // --- Control yoke -----------------------------------------------------------
  const metal = new THREE.MeshStandardMaterial({ color: '#181d22', roughness: 0.5, metalness: 0.6 });
  const yoke = new THREE.Group();
  yoke.position.set(0, -0.62, -0.78);
  group.add(yoke);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 12), metal);
  column.position.y = -0.32; column.rotation.x = 0.32; yoke.add(column);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 10, 28, Math.PI * 1.25), metal);
  wheel.rotation.x = -0.18; yoke.add(wheel);
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), metal);
  hub.rotation.x = -0.18; yoke.add(hub);

  // --- Throttle pedestal + lever ----------------------------------------------
  const ped = new THREE.Group();
  ped.position.set(0.66, -0.52, -0.95);
  ped.rotation.x = 0.45;
  group.add(ped);
  const pedMetal = new THREE.MeshStandardMaterial({ color: '#3a424a', roughness: 0.5, metalness: 0.6 });
  ped.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.4), pedMetal));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.34), new THREE.MeshBasicMaterial({ color: '#0b0e11' }));
  slot.position.y = 0.05; ped.add(slot);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(0, 0.04, 0.13); ped.add(leverPivot);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.3, 10), metal);
  lever.position.y = 0.15; leverPivot.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: '#c2453a', roughness: 0.5, metalness: 0.2 }));
  knob.position.y = 0.3; leverPivot.add(knob);
  knob.userData.grab = 'throttle';

  function setLeverAngle(frac) { leverPivot.rotation.x = -0.55 + frac * 1.1; }

  function drawPanel(state) {
    pctx.drawImage(staticCanvas, 0, 0);
    drawLive(pctx, state);
    panelTex.needsUpdate = true;
  }

  return { group, knob, drawPanel, setLeverAngle, grabbables: [knob] };
}

// --- Live layer: animated needles + warning lights ----------------------------
function drawLive(ctx, state) {
  const m = state.mission || { cruiseAltitude: 25000, minAltitudeToProceed: 18000 };
  needle(ctx, LIVE.airspeed, (state.throttle - 0.7) / 0.7, '#7fe08a');
  needle(ctx, LIVE.altitude, state.altitude / m.cruiseAltitude, state.altitude < m.minAltitudeToProceed ? '#e0584a' : '#dfeaf2');
  needle(ctx, LIVE.fuel, state.fuel / 100, state.fuel > 30 ? '#7fe08a' : '#e6b84d');
  needle(ctx, LIVE.airframe, state.health / 100, state.health > 40 ? '#7fe08a' : '#e0584a');

  const lights = [
    [690, 'ENGINE FIRE', state.fire, '#e0584a'],
    [1010, 'FUEL LEAK', state.leak, '#e6b84d'],
    [1330, `ENG OUT ${state.enginesOut || 0}`, state.enginesOut > 0, '#e0584a'],
  ];
  for (const [x, label, on, col] of lights) light(ctx, x, 840, 280, 66, on, label, col);
}

function needle(ctx, g, frac, color) {
  const a = (-220 + Math.max(0, Math.min(1, frac)) * 260) * Math.PI / 180;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + Math.cos(a) * g.r * 0.72, g.cy + Math.sin(a) * g.r * 0.72); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(g.cx, g.cy, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function light(ctx, x, y, w, h, on, label, col) {
  ctx.fillStyle = on ? col : '#272d33';
  ctx.strokeStyle = '#454f57'; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? '#0b0e11' : '#7e8c99';
  ctx.textAlign = 'center'; ctx.font = `bold ${h * 0.4}px "Courier New", monospace`;
  ctx.fillText(label, x + w / 2, y + h * 0.62);
}

// --- Static panel art (built once) --------------------------------------------
function buildStaticPanel() {
  const c = document.createElement('canvas');
  c.width = PANEL_W; c.height = PANEL_H;
  const ctx = c.getContext('2d');

  // Crinkle-black metal with a top-down lighting gradient.
  const g = ctx.createLinearGradient(0, 0, 0, PANEL_H);
  g.addColorStop(0, '#2b343b'); g.addColorStop(0.25, '#1d242a'); g.addColorStop(1, '#11161a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, PANEL_W, PANEL_H);
  // speckle texture
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 5000; i++) ctx.fillRect(Math.random() * PANEL_W, Math.random() * PANEL_H, 1.4, 1.4);
  // glareshield shadow across the top
  const sh = ctx.createLinearGradient(0, 0, 0, 150);
  sh.addColorStop(0, 'rgba(0,0,0,0.65)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, PANEL_W, 150);
  // rivets
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 40; y < PANEL_H; y += 60) for (let x = 40; x < PANEL_W; x += 70) {
    ctx.beginPath(); ctx.arc(x + (Math.floor(y / 60) % 2) * 35, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // Instrument bezels.
  // Pilot six-pack (left) — top row live + attitude; bottom row decorative.
  face(ctx, 360, 250, 125, 'AIRSPEED');
  attitude(ctx, 595, 250, 125);
  face(ctx, 830, 250, 125, 'ALTITUDE');
  face(ctx, 360, 540, 108, 'TURN & BANK', true);
  face(ctx, 595, 540, 108, 'HEADING', true);
  face(ctx, 830, 540, 108, 'CLIMB', true);
  // Engine cluster (right).
  face(ctx, 1360, 250, 125, 'FUEL');
  face(ctx, 1690, 250, 125, 'AIRFRAME');
  face(ctx, 1360, 540, 100, 'MANIFOLD', true);
  face(ctx, 1545, 540, 100, 'R.P.M.', true);
  face(ctx, 1730, 540, 100, 'OIL TEMP', true);

  // Placard between the clusters.
  ctx.fillStyle = '#c9b048'; ctx.strokeStyle = '#0b0e11'; ctx.lineWidth = 3;
  roundRect(ctx, 1010, 470, 230, 84, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0b0e11'; ctx.textAlign = 'center';
  ctx.font = 'bold 28px "Courier New", monospace'; ctx.fillText('WARNING', 1125, 505);
  ctx.font = '14px "Courier New", monospace'; ctx.fillText('LIMIT 250 MPH IAS', 1125, 532);

  // Switch row across the bottom.
  ctx.fillStyle = '#9fb0bd'; ctx.font = 'bold 20px "Courier New", monospace'; ctx.textAlign = 'left';
  ctx.fillText('OXY    HTR    GEAR   FLAPS   TRIM   MIX', 150, 700);
  for (let i = 0; i < 12; i++) toggle(ctx, 165 + i * 64, 720, i % 3 === 0);

  return c;
}

function face(ctx, cx, cy, r, label, decorative) {
  // outer bezel
  ctx.fillStyle = '#525d68';
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b333b';
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill();
  // glass face
  const gg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  gg.addColorStop(0, '#10161b'); gg.addColorStop(1, '#05080a');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // ticks + numbers
  ctx.strokeStyle = '#aeb9c4';
  for (let i = 0; i <= 10; i++) {
    const a = (-220 + i * 26) * Math.PI / 180;
    ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
    const r0 = i % 5 === 0 ? r * 0.72 : r * 0.82;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  ctx.fillStyle = '#8593a0'; ctx.textAlign = 'center';
  ctx.font = `bold ${r * 0.18}px "Courier New", monospace`;
  ctx.fillText(label, cx, cy + r * 0.55);
  // decorative gauges get a fixed needle so the panel looks alive
  if (decorative) needleStatic(ctx, cx, cy, r, 0.35 + Math.random() * 0.4);
}

function needleStatic(ctx, cx, cy, r, frac) {
  const a = (-220 + frac * 260) * Math.PI / 180;
  ctx.strokeStyle = '#c7d2db'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); ctx.stroke();
  ctx.fillStyle = '#c7d2db'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
}

function attitude(ctx, cx, cy, r) {
  ctx.fillStyle = '#525d68'; ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#3f6ea5'; ctx.fillRect(cx - r, cy - r, r * 2, r);       // sky
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(cx - r, cy, r * 2, r);           // ground
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#e6b84d'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx - r * 0.15, cy);
  ctx.moveTo(cx + r * 0.15, cy); ctx.lineTo(cx + r * 0.5, cy);
  ctx.moveTo(cx, cy - r * 0.12); ctx.lineTo(cx, cy + r * 0.12); ctx.stroke();
  ctx.fillStyle = '#8593a0'; ctx.textAlign = 'center';
  ctx.font = `bold ${r * 0.18}px "Courier New", monospace`;
  ctx.fillText('ATTITUDE', cx, cy + r * 0.78);
}

function toggle(ctx, x, y, up) {
  ctx.fillStyle = '#0c0f13'; roundRect(ctx, x - 14, y - 6, 28, 44, 5); ctx.fill();
  ctx.fillStyle = '#9aa7b2'; roundRect(ctx, x - 6, up ? y - 4 : y + 18, 12, 20, 4); ctx.fill();
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
