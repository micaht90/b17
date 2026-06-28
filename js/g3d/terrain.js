// Aerial farmland terrain far below the bomber, with distance haze.

import * as THREE from 'three';

export function createTerrain(scene) {
  const tex = fieldsTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  tex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -700;
  scene.add(ground);

  scene.fog = new THREE.Fog(0xbcd4e6, 3000, 13000);
  return ground;
}

function fieldsTexture() {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const pal = ['#7c8a50', '#93a05f', '#b3ab73', '#67753f', '#a89a6a', '#5d6b3a', '#8a9657', '#9caa66', '#727f48'];
  // patchwork fields
  const cell = 64;
  for (let gy = 0; gy < N / cell + 1; gy++) {
    for (let gx = 0; gx < N / cell + 1; gx++) {
      x.fillStyle = pal[(gx * 7 + gy * 13) % pal.length];
      x.fillRect(gx * cell + ((gy % 2) * cell * 0.5), gy * cell, cell - 2, cell - 2);
    }
  }
  // a river
  x.strokeStyle = '#4d6f93'; x.lineWidth = 10; x.lineCap = 'round';
  x.beginPath();
  for (let y = 0; y <= N; y += 16) { const xx = N * 0.4 + Math.sin(y * 0.03) * N * 0.18; y === 0 ? x.moveTo(xx, y) : x.lineTo(xx, y); }
  x.stroke();
  // roads
  x.strokeStyle = 'rgba(60,58,52,0.8)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, N * 0.3); x.lineTo(N, N * 0.36); x.stroke();
  x.beginPath(); x.moveTo(N * 0.7, 0); x.lineTo(N * 0.66, N); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
