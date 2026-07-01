// Aerial farmland terrain far below the bomber, with distance haze.

import * as THREE from 'three';

export function createTerrain(scene) {
  const tex = fieldsTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xd4d7c6, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -700;
  scene.add(ground);

  const detail = new THREE.Group();
  detail.position.y = -695;
  scene.add(detail);

  addRibbon(detail, [
    [-13800, -16000], [-12000, -11800], [-13200, -7900], [-9600, -4200], [-11100, 900],
    [-7800, 4200], [-8700, 8200], [-5200, 11800], [-6000, 16000],
  ], 360, 0x4d6f93, 0.78);
  addRibbon(detail, [
    [7400, -16000], [5600, -12000], [7200, -8000], [4800, -4200], [6100, -700],
    [3600, 2600], [5200, 6500], [2900, 10400], [4100, 16000],
  ], 250, 0x49698a, 0.72);
  addRibbon(detail, [
    [-16000, -4200], [-11200, -3600], [-6800, -5000], [-2100, -3300], [2600, -4100], [7600, -2900], [16000, -3500],
  ], 80, 0x4f4d43, 0.82);
  addRibbon(detail, [
    [-12600, 7600], [-8300, 6100], [-3800, 7200], [800, 5600], [4300, 6900], [9200, 5300], [16000, 6500],
  ], 70, 0x565246, 0.78);

  addTown(detail, -7200, -1700, 1.0);
  addTown(detail, 3400, 2100, 0.82);
  addTown(detail, 9000, -5700, 0.7);
  addForest(detail, -2400, -9200, 1.25);
  addForest(detail, 8200, 7800, 1.05);
  addForest(detail, -10300, 10600, 0.85);

  scene.fog = new THREE.Fog(0xc8d7e4, 2600, 12500);
  return ground;
}

function fieldsTexture() {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const pal = ['#78864d', '#96a365', '#b2aa72', '#63713c', '#a79a68', '#586737', '#86935b', '#9cab67', '#727f48', '#8f835c'];
  // patchwork fields
  x.fillStyle = '#737f49';
  x.fillRect(0, 0, N, N);
  const cell = 58;
  for (let gy = -1; gy < N / cell + 2; gy++) {
    for (let gx = -1; gx < N / cell + 2; gx++) {
      const jitterX = seeded(gx * 19 + gy * 31) * 16 - 8;
      const jitterY = seeded(gx * 43 - gy * 17) * 16 - 8;
      const w = cell * (0.78 + seeded(gx * 29 + gy * 5) * 0.52);
      const h = cell * (0.72 + seeded(gx * 11 + gy * 37) * 0.58);
      x.fillStyle = pal[Math.floor(seeded(gx * 71 + gy * 97) * pal.length) % pal.length];
      x.fillRect(gx * cell + ((gy % 2) * cell * 0.35) + jitterX, gy * cell + jitterY, w - 3, h - 3);
      if ((gx + gy) % 5 === 0) {
        x.strokeStyle = 'rgba(42,50,32,0.18)';
        x.lineWidth = 1;
        x.strokeRect(gx * cell + jitterX, gy * cell + jitterY, w - 3, h - 3);
      }
    }
  }
  // hedgerows and drainage ditches
  x.strokeStyle = 'rgba(42,55,34,0.22)';
  x.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    const y = seeded(i * 17) * N;
    x.beginPath();
    x.moveTo(0, y);
    for (let xx = 0; xx <= N; xx += 48) x.lineTo(xx, y + Math.sin(xx * 0.014 + i) * 10);
    x.stroke();
  }
  // a river
  x.strokeStyle = '#4d6f93'; x.lineWidth = 16; x.lineCap = 'round';
  x.beginPath();
  for (let y = 0; y <= N; y += 16) { const xx = N * 0.4 + Math.sin(y * 0.027) * N * 0.15 + Math.sin(y * 0.009) * N * 0.08; y === 0 ? x.moveTo(xx, y) : x.lineTo(xx, y); }
  x.stroke();
  // roads
  x.strokeStyle = 'rgba(61,58,50,0.8)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, N * 0.3); x.lineTo(N, N * 0.36); x.stroke();
  x.beginPath(); x.moveTo(N * 0.7, 0); x.lineTo(N * 0.66, N); x.stroke();
  // small villages as dark speckles baked into the texture.
  for (let v = 0; v < 9; v++) {
    const cx = seeded(v * 101) * N;
    const cy = seeded(v * 173 + 2) * N;
    x.fillStyle = 'rgba(70,70,62,0.58)';
    for (let b = 0; b < 18; b++) {
      const a = seeded(v * 97 + b * 11) * Math.PI * 2;
      const r = seeded(v * 43 + b * 29) * 52;
      x.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5 + seeded(b * 13) * 10, 4 + seeded(b * 23) * 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function seeded(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function addRibbon(group, points, width, color, opacity) {
  const pts = points.map(([x, z]) => new THREE.Vector2(x, z));
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width * 0.5);
    left.push(pts[i].clone().add(normal));
    right.push(pts[i].clone().sub(normal));
  }
  const verts = [];
  for (const p of left) verts.push(p.x, 0, p.y);
  for (let i = right.length - 1; i >= 0; i--) verts.push(right[i].x, 0, right[i].y);
  const shape = new THREE.Shape();
  shape.moveTo(verts[0], verts[2]);
  for (let i = 3; i < verts.length; i += 3) shape.lineTo(verts[i], verts[i + 2]);
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  group.add(mesh);
}

function addTown(group, x, z, scale) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x4d5148, transparent: true, opacity: 0.72, depthWrite: false });
  const road = new THREE.MeshBasicMaterial({ color: 0x33332d, transparent: true, opacity: 0.75, depthWrite: false });
  for (let i = 0; i < 28; i++) {
    const a = seeded(x + z + i * 13) * Math.PI * 2;
    const r = (110 + seeded(i * 31 + x) * 420) * scale;
    const w = (70 + seeded(i * 17) * 115) * scale;
    const h = (45 + seeded(i * 23) * 90) * scale;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    b.rotation.x = -Math.PI / 2;
    b.rotation.z = seeded(i * 41) * Math.PI;
    b.position.set(x + Math.cos(a) * r, 1.8, z + Math.sin(a) * r);
    group.add(b);
  }
  for (const rot of [0, Math.PI / 2.8]) {
    const rd = new THREE.Mesh(new THREE.PlaneGeometry(1150 * scale, 42 * scale), road);
    rd.rotation.x = -Math.PI / 2;
    rd.rotation.z = rot;
    rd.position.set(x, 2.0, z);
    group.add(rd);
  }
}

function addForest(group, x, z, scale) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x33492e, transparent: true, opacity: 0.64, depthWrite: false });
  for (let i = 0; i < 11; i++) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry((260 + seeded(i * 73) * 360) * scale, 18), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.scale.set(1.8, 1, 1);
    patch.position.set(x + (seeded(i * 47) - 0.5) * 1150 * scale, 1.5, z + (seeded(i * 59) - 0.5) * 900 * scale);
    patch.rotation.z = seeded(i * 67) * Math.PI;
    group.add(patch);
  }
}
