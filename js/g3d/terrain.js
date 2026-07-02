// Occupied-Europe countryside far below the bomber: an organic painted map
// (seeded Voronoi field patchwork, hedgerows, rivers, road-linked villages)
// on one huge ground plane, plus a scrolling 3D layer of villages, forests
// and farms that streams past at cloud speed so altitude + motion read from
// every gun station.
//
// Contract with game.js: the bomb-run city group sits at y=-960 with its own
// opaque ground plate, so the terrain ground lives BELOW it (y=-1060) and
// every 3D structure tops out under y=-960 — the city is never occluded, and
// nothing pokes up through its plate while clusters scroll beneath it.

import * as THREE from 'three';

// --- Layout constants -----------------------------------------------------
const GROUND_Y = -1060;      // below the bomb-run city plate at y=-960
const GROUND_SIZE = 40000;
const TEX_REPEAT = 2;        // mirrored 2x2 -> one tile spans 20000 units
const WRAP_Z = 8000;         // detail clusters wrap over z in [-8000, 8000]
const SPAN_X = 6000;
const MAX_MESHES = 310;      // hard perf budget for the detail layer

// --- Seeded PRNG (same pattern as game.js) ---------------------------------
function seeded(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
// Sequential stream on top of seeded(): stable map on every load.
function makeRng(seed) {
  let n = seed;
  return () => seeded(++n * 1.6180339 + 0.42);
}

// --- Entry ------------------------------------------------------------------
export function createTerrain(scene) {
  const tex = countrysideTexture();
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;   // seam-free tiling
  tex.repeat.set(TEX_REPEAT, TEX_REPEAT);
  tex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xd4d7c6, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  scene.add(ground);

  const detail = buildDetail();
  detail.position.y = GROUND_Y + 1.5;   // sit just on the ground plane
  scene.add(detail);

  // Bluish haze that saturates before the camera far plane (8000), so the
  // ground melts into the sky instead of showing a clipped hard edge.
  scene.fog = new THREE.Fog(0xbcd4e6, 2600, 7600);

  const clusters = detail.children;
  const texRate = TEX_REPEAT / GROUND_SIZE;   // uv per world unit
  // Scroll everything toward +Z at the exact cloud rate from engine.js
  // (60*speed world units/sec) so the whole world outside moves as one.
  function update(dt, speed) {
    const v = 60 * speed * dt;
    tex.offset.y += v * texRate;                // painted fields glide too
    if (tex.offset.y > 2) tex.offset.y -= 2;    // mirrored wrap period is 2
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      c.position.z += v;
      if (c.position.z > WRAP_Z) c.position.z -= WRAP_Z * 2;
    }
  }
  return { ground, update };
}

// --- Ground texture ----------------------------------------------------------
// One 2048px canvas painted once. Layers: Voronoi field patchwork (with
// hedgerow borders + crop-row striping), rivers/lakes, forest blobs, then a
// road network strung with villages. Every position comes from one seeded
// stream, so the map is identical between loads.
function countrysideTexture() {
  // 1536 is the sweet spot: the Voronoi base is computed at 1024 anyway, and
  // the vector overlays (roads/villages/rivers) stay crisp while VRAM drops
  // ~45% vs a 2048 canvas — that matters on phones.
  const T = 1536;
  const rng = makeRng(1943);
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const x = c.getContext('2d');
  paintFields(x, T, rng);
  paintWater(x, T, rng);
  paintForests(x, T, rng);
  paintSettlements(x, T, rng);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Field patchwork (per-pixel Voronoi) --------------------------------------
// ~225 jittered-grid sites give organic polygonal fields; the gap between the
// nearest and second-nearest site marks the boundary, drawn as a dark
// hedgerow. Computed at half res then upscaled (softens edges, quarters cost).
function paintFields(x, T, rng) {
  const V = 1024, G = 15, cs = V / G, NC = G * G;
  // believable palette: pasture greens dominate, then straw, plough, dark crop
  const PAL = [
    [122, 139, 82], [104, 122, 66], [138, 148, 89], [117, 132, 74],
    [176, 163, 100], [189, 176, 112],
    [124, 101, 71], [103, 85, 59],
    [88, 104, 58], [72, 88, 50],
  ];
  const sx = new Float32Array(NC), sy = new Float32Array(NC);
  const cr = new Float32Array(NC), cg = new Float32Array(NC), cb = new Float32Array(NC);
  const rowC = new Float32Array(NC), rowS = new Float32Array(NC), rowF = new Float32Array(NC);
  const plough = new Uint8Array(NC);
  for (let i = 0; i < NC; i++) {
    sx[i] = ((i % G) + 0.16 + rng() * 0.68) * cs;
    sy[i] = (((i / G) | 0) + 0.16 + rng() * 0.68) * cs;
    const pi = Math.min(PAL.length - 1, (Math.pow(rng(), 1.35) * PAL.length) | 0);
    const b = 0.86 + rng() * 0.26;              // per-cell brightness variation
    cr[i] = PAL[pi][0] * b; cg[i] = PAL[pi][1] * b; cb[i] = PAL[pi][2] * b;
    plough[i] = pi >= 6 ? 1 : 0;                // plough/dark crops get rows
    const a = rng() * Math.PI;
    rowC[i] = Math.cos(a); rowS[i] = Math.sin(a);
    rowF[i] = 0.9 + rng() * 0.8;
  }
  const off = document.createElement('canvas');
  off.width = off.height = V;
  const ox = off.getContext('2d');
  const img = ox.createImageData(V, V);
  const d = img.data;
  let p = 0;
  for (let py = 0; py < V; py++) {
    const gy = Math.min(G - 1, (py / cs) | 0);
    const y0 = Math.max(0, gy - 1) * G, y1 = Math.min(G - 1, gy + 1) * G;
    for (let px = 0; px < V; px++) {
      const gx = Math.min(G - 1, (px / cs) | 0);
      const x0 = Math.max(0, gx - 1), x1 = Math.min(G - 1, gx + 1);
      let d1 = 1e9, d2 = 1e9, bi = 0;
      for (let ry = y0; ry <= y1; ry += G) {
        for (let nx = x0; nx <= x1; nx++) {
          const i = ry + nx, ddx = px - sx[i], ddy = py - sy[i], dd = ddx * ddx + ddy * ddy;
          if (dd < d1) { d2 = d1; d1 = dd; bi = i; } else if (dd < d2) d2 = dd;
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      // per-pixel grain + crop-row striping on ploughed cells
      let f = 0.965 + (((px * 340573 ^ py * 640331) & 255) / 255) * 0.07;
      if (plough[bi]) f *= 1 + 0.085 * Math.sin((px * rowC[bi] + py * rowS[bi]) * rowF[bi]);
      let r = cr[bi] * f, g = cg[bi] * f, b = cb[bi] * f;
      if (edge < 2.8) {                          // thin dark hedgerow border
        const h = (1 - edge / 2.8) * 0.75;
        r += (49 - r) * h; g += (58 - g) * h; b += (38 - b) * h;
      }
      d[p++] = r; d[p++] = g; d[p++] = b; d[p++] = 255;
    }
  }
  ox.putImageData(img, 0, 0);
  x.imageSmoothingEnabled = true;
  x.drawImage(off, 0, 0, T, T);
}

// --- Rivers + lakes ------------------------------------------------------------
function paintWater(x, T, rng) {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const BANK = 'rgba(209,201,166,0.85)', WATER = '#4d7095';
  const rivers = [];
  for (const [u, s] of [[0.28, 1.0], [0.73, 0.78]]) {
    const A1 = T * (0.045 + rng() * 0.03), f1 = 0.004 + rng() * 0.002, p1 = rng() * 6.28;
    const A2 = T * (0.015 + rng() * 0.012), f2 = 0.013 + rng() * 0.006, p2 = rng() * 6.28;
    const fx = (y) => T * u + A1 * Math.sin(y * f1 + p1) + A2 * Math.sin(y * f2 + p2);
    rivers.push(fx);
    strokeRiver(x, fx, T, BANK, 24 * s);   // slightly lighter banks first
    strokeRiver(x, fx, T, WATER, 12 * s);
  }
  // small tributary curving off the west edge into the first river
  const jy = T * (0.55 + rng() * 0.2), jx = rivers[0](jy);
  const sy = T * (0.3 + rng() * 0.2);
  const mx = jx * (0.35 + rng() * 0.2), my = jy - T * (0.1 + rng() * 0.15);
  for (const [st, w] of [[BANK, 15], [WATER, 7.5]]) {
    x.strokeStyle = st; x.lineWidth = w;
    x.beginPath(); x.moveTo(0, sy); x.quadraticCurveTo(mx, my, jx, jy); x.stroke();
  }
  // a couple of small lakes with pale shores
  for (let i = 0; i < 2; i++) {
    const lx = T * (0.12 + rng() * 0.76), ly = T * (0.12 + rng() * 0.76);
    const r = T * (0.012 + rng() * 0.012);
    x.fillStyle = BANK; blob(x, lx, ly, r * 1.45, rng);
    x.fillStyle = WATER; blob(x, lx, ly, r, rng);
  }
}

function strokeRiver(x, fx, T, style, width) {
  x.strokeStyle = style;
  x.lineWidth = width;
  x.beginPath();
  for (let y = 0; y <= T; y += 24) {
    const px = fx(y);
    y === 0 ? x.moveTo(px, y) : x.lineTo(px, y);
  }
  x.stroke();
}

function blob(x, cx, cy, r, rng) {
  for (let i = 0; i < 3; i++) {
    const a = rng() * 6.28, d = r * 0.45 * rng(), rr = r * (0.7 + rng() * 0.4);
    x.beginPath();
    x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, 6.2832);
    x.fill();
  }
}

// --- Forest blobs ----------------------------------------------------------------
function paintForests(x, T, rng) {
  for (let i = 0; i < 6; i++) {
    const cx = T * (0.08 + rng() * 0.84), cy = T * (0.08 + rng() * 0.84);
    const R = T * (0.03 + rng() * 0.045), n = 14 + ((rng() * 10) | 0);
    for (let j = 0; j < n; j++) {                 // overlapping dark discs
      const a = rng() * 6.28, rad = R * Math.sqrt(rng());
      x.fillStyle = j % 2 ? 'rgba(58,82,48,0.9)' : 'rgba(47,70,40,0.9)';
      x.beginPath();
      x.arc(cx + Math.cos(a) * rad * 1.4, cy + Math.sin(a) * rad, R * (0.3 + rng() * 0.5), 0, 6.2832);
      x.fill();
    }
    for (let j = 0; j < 40; j++) {                // mottled canopy texture
      const a = rng() * 6.28, rad = R * Math.sqrt(rng());
      x.fillStyle = j % 2 ? 'rgba(24,36,20,0.5)' : 'rgba(96,116,66,0.4)';
      x.beginPath();
      x.arc(cx + Math.cos(a) * rad * 1.4, cy + Math.sin(a) * rad, 2 + rng() * 3, 0, 6.2832);
      x.fill();
    }
  }
}

// --- Roads + villages ---------------------------------------------------------------
function paintSettlements(x, T, rng) {
  // one market town + 8 villages, spread out by rejection sampling
  const sites = [{ x: T * (0.3 + rng() * 0.4), y: T * (0.3 + rng() * 0.4), s: 2.1 }];
  let guard = 0;
  while (sites.length < 9 && guard++ < 500) {
    const px = T * (0.08 + rng() * 0.84), py = T * (0.08 + rng() * 0.84);
    let ok = true;
    for (const s of sites) {
      if ((s.x - px) * (s.x - px) + (s.y - py) * (s.y - py) < T * T * 0.029) { ok = false; break; }
    }
    if (ok) sites.push({ x: px, y: py, s: 0.75 + rng() * 0.55 });
  }
  // minimal spanning road net (Prim): every village joins the network
  const linked = [0];
  const angles = new Array(sites.length).fill(null);
  while (linked.length < sites.length) {
    let bi = -1, bj = 0, bd = 1e18;
    for (let i = 0; i < sites.length; i++) {
      if (linked.indexOf(i) >= 0) continue;
      for (const j of linked) {
        const dd = (sites[i].x - sites[j].x) ** 2 + (sites[i].y - sites[j].y) ** 2;
        if (dd < bd) { bd = dd; bi = i; bj = j; }
      }
    }
    drawRoad(x, sites[bi], sites[bj], rng);
    const a = Math.atan2(sites[bj].y - sites[bi].y, sites[bj].x - sites[bi].x);
    if (angles[bi] === null) angles[bi] = a;
    if (angles[bj] === null) angles[bj] = a;
    linked.push(bi);
  }
  // two through-roads out of the town, meeting the map edge nearly square-on
  // so the mirrored neighbour tile continues them without an obvious kink
  drawRoad(x, sites[0], { x: sites[0].x + (rng() - 0.5) * T * 0.06, y: 0 }, rng, 0.1);
  drawRoad(x, { x: T, y: sites[0].y + (rng() - 0.5) * T * 0.06 }, sites[0], rng, 0.1);
  for (let i = 0; i < sites.length; i++) {
    paintVillage(x, sites[i], angles[i] === null ? rng() * Math.PI : angles[i], rng);
  }
}

function drawRoad(x, a, b, rng, curv = 0.32) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const mx = (a.x + b.x) / 2 - (dy / len) * len * (rng() - 0.5) * curv;
  const my = (a.y + b.y) / 2 + (dx / len) * len * (rng() - 0.5) * curv;
  x.lineCap = 'round';
  for (const [st, w] of [['rgba(86,82,64,0.45)', 4.6], ['#c9bfa2', 2.6]]) {
    x.strokeStyle = st; x.lineWidth = w;
    x.beginPath(); x.moveTo(a.x, a.y); x.quadraticCurveTo(mx, my, b.x, b.y); x.stroke();
  }
}

const ROOF_INK = ['#7c5a43', '#6b493a', '#5a544d', '#4a453f', '#8a6b4d'];
function paintVillage(x, site, ang, rng) {
  const cx = site.x, cy = site.y, s = site.s;
  // village core drawn first: churchyard green + pale market square
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.fillStyle = 'rgba(66,86,52,0.9)';
  x.beginPath(); x.arc(9 * s, -7 * s, 5.5 * s, 0, 6.2832); x.fill();
  x.fillStyle = 'rgba(185,173,141,0.9)';
  x.fillRect(-4 * s, -3 * s, 8 * s, 6 * s);
  x.restore();
  // roof-coloured houses strung along the road (+ the odd cross-lane)
  const n = Math.round((13 + rng() * 9) * s);
  for (let i = 0; i < n; i++) {
    const aa = rng() < 0.3 ? ang + 1.5708 : ang;
    const ca = Math.cos(aa), sa = Math.sin(aa);
    const along = (rng() - 0.5) * 52 * s;
    const side = (2.2 + rng() * 9) * (rng() < 0.5 ? -1 : 1);
    x.save();
    x.translate(cx + ca * along - sa * side, cy + sa * along + ca * side);
    x.rotate(aa + (rng() - 0.5) * 0.3);
    x.fillStyle = ROOF_INK[(rng() * ROOF_INK.length) | 0];
    x.fillRect(-2.6 - rng() * 2, -1.6 - rng(), 5.2 + rng() * 4, 3.2 + rng() * 2);
    x.restore();
  }
  // the church by the yard, drawn last so it stays visible
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.fillStyle = '#31352c'; x.fillRect(2 * s, -2 * s, 8 * s, 3.4 * s);
  x.fillStyle = '#cabfa0'; x.fillRect(1 * s, -1.6 * s, 2.6 * s, 2.6 * s);
  x.restore();
}

// --- 3D detail layer -----------------------------------------------------------------
// Scattered clusters that scroll under the ship: villages of small houses with
// a church tower + spire, conifer clumps, isolated farms. One shared box and
// cone geometry, scaled per instance; a handful of shared materials.
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.translate(0, 0.5, 0);                    // origin at the base
const coneGeo = new THREE.ConeGeometry(0.5, 1, 6);
coneGeo.translate(0, 0.5, 0);
const std = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 });
const MAT = {
  roofs: [std(0x7a5341), std(0x664a3b), std(0x59544d), std(0x4a4d45)],
  stone: std(0x9b9280),
  spire: std(0x3b3f39),
  barn: std(0x55422f),
  trees: [std(0x2a4426), std(0x223a1e), std(0x314c2a)],
};

function buildDetail() {
  const rng = makeRng(4417);
  const group = new THREE.Group();
  const budget = { n: 0 };
  // shuffled slot grid spreads clusters over the wrap volume without overlap
  const slots = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 7; j++) {
      slots.push([-SPAN_X + (i + 0.5) * (SPAN_X * 2 / 5), -WRAP_Z + (j + 0.5) * (WRAP_Z * 2 / 7)]);
    }
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
  }
  // villages and farms first so any budget trimming only thins forests
  let s = 0;
  for (let i = 0; i < 10; i++) addVillage(group, slots[s++], rng, budget);
  for (let i = 0; i < 4; i++) addFarm(group, slots[s++], rng, budget);
  for (let i = 0; i < 12; i++) addForest(group, slots[s++], rng, budget);
  return group;
}

// Shared mesh factory: enforces the perf budget, scales the shared geometry.
function put(cluster, geo, mat, budget, w, h, d, px, pz, ry) {
  if (budget.n >= MAX_MESHES) return null;
  budget.n++;
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(w, h, d);
  m.position.set(px, 0, pz);
  if (ry) m.rotation.y = ry;
  cluster.add(m);
  return m;
}

function clusterAt(group, slot, rng) {
  const g = new THREE.Group();
  g.position.set(slot[0] + (rng() - 0.5) * 1300, 0, slot[1] + (rng() - 0.5) * 1600);
  group.add(g);
  return g;
}

function addVillage(group, slot, rng, budget) {
  const v = clusterAt(group, slot, rng);
  const a = rng() * Math.PI, dx = Math.cos(a), dz = Math.sin(a);   // street dir
  const len = 260 + rng() * 320;
  const n = 6 + ((rng() * 11) | 0);                               // 6..16 houses
  for (let i = 0; i < n; i++) {
    const t = (rng() - 0.5) * len;
    const side = (24 + rng() * 66) * (rng() < 0.5 ? -1 : 1);
    put(v, boxGeo, MAT.roofs[(rng() * 4) | 0], budget,
      36 + rng() * 44, 25 + rng() * 35, 30 + rng() * 34,
      dx * t - dz * side, dz * t + dx * side, -a + (rng() - 0.5) * 0.35);
  }
  // church: stone tower + dark spire; tallest thing, still under the city plate
  const th = 46 + rng() * 18;
  put(v, boxGeo, MAT.stone, budget, 26, th, 26, dz * 40, -dx * 40, -a);
  const sp = put(v, coneGeo, MAT.spire, budget, 34, 18 + rng() * 8, 34, dz * 40, -dx * 40, -a);
  if (sp) sp.position.y = th;
  if (rng() < 0.6) {
    put(v, boxGeo, MAT.barn, budget, 84 + rng() * 46, 24 + rng() * 12, 46 + rng() * 16,
      dx * len * 0.55, dz * len * 0.55, -a + 0.4);
  }
}

function addFarm(group, slot, rng, budget) {
  const f = clusterAt(group, slot, rng);
  const a = rng() * Math.PI;
  put(f, boxGeo, MAT.roofs[(rng() * 4) | 0], budget, 36 + rng() * 16, 25 + rng() * 10, 30 + rng() * 12, 0, 0, -a);
  if (rng() < 0.75) put(f, boxGeo, MAT.barn, budget, 70 + rng() * 40, 24 + rng() * 10, 40 + rng() * 14, 90 + rng() * 40, 30, -a + 0.5);
  if (rng() < 0.45) put(f, boxGeo, MAT.roofs[(rng() * 4) | 0], budget, 26, 25, 24, -70 - rng() * 30, -50, -a);
}

function addForest(group, slot, rng, budget) {
  const f = clusterAt(group, slot, rng);
  const n = 8 + ((rng() * 11) | 0);                 // 8..18 trees per clump
  const R = 170 + rng() * 240, ex = 1.15 + rng() * 0.85;
  for (let i = 0; i < n; i++) {
    const r = R * Math.sqrt(rng()), t = rng() * 6.2832;
    const w = 34 + rng() * 30;
    put(f, coneGeo, MAT.trees[(rng() * 3) | 0], budget, w, 36 + rng() * 38, w,
      Math.cos(t) * r * ex, Math.sin(t) * r);
  }
}
