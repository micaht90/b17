// 3D engine: renderer, atmospheric sky (gradient + sun glow + haze), a layered
// cloud field at altitude with an undercast below, lighting, and the loop.

import * as THREE from 'three';

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 8000);

  const sunDir = new THREE.Vector3(0.35, 0.5, -0.78).normalize();

  // --- Sky dome -----------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(5000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#15356b') },
        mid: { value: new THREE.Color('#5b8fc4') },
        bottom: { value: new THREE.Color('#cfe0ee') },
        sunDir: { value: sunDir.clone() },
        sunCol: { value: new THREE.Color('#fff3d6') },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 top, mid, bottom, sunDir, sunCol;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
          vec3 base = mix(bottom, mid, smoothstep(0.0,0.55,h));
          base = mix(base, top, smoothstep(0.5,1.0,h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          float disc = pow(s, 220.0);
          float glow = pow(s, 7.0) * 0.5;
          gl_FragColor = vec4(base + sunCol*(disc + glow), 1.0);
        }
      `,
    }),
  );
  scene.add(sky);

  // --- Lighting -----------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xbcd6ef, 0x5b6747, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2d4, 1.5);
  sun.position.copy(sunDir).multiplyScalar(1000);
  scene.add(sun);

  // --- Soft cloud sprites -------------------------------------------------------
  const cloudTex = makeCloudTexture();
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.95, depthWrite: false });
  const clouds = [];
  // A layer roughly at flight level, scattered around the bomber.
  for (let i = 0; i < 70; i++) {
    const puffs = 3 + (i % 4);
    const group = new THREE.Group();
    const cx = (Math.random() - 0.5) * 5000;
    const cy = -40 + Math.random() * 220;
    const cz = (Math.random() - 0.5) * 5000;
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Sprite(cloudMat);
      const sc = 220 + Math.random() * 260;
      s.scale.set(sc, sc * 0.62, 1);
      s.position.set((Math.random() - 0.5) * sc * 1.3, (Math.random() - 0.5) * sc * 0.3, (Math.random() - 0.5) * sc * 1.3);
      group.add(s);
    }
    group.position.set(cx, cy, cz);
    scene.add(group);
    clouds.push(group);
  }
  // Distant undercast deck.
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(16000, 16000),
    new THREE.MeshStandardMaterial({ color: '#aeb9bf', roughness: 1 }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = -650;
  scene.add(deck);
  for (let i = 0; i < 50; i++) {
    const s = new THREE.Sprite(cloudMat);
    const sc = 500 + Math.random() * 700;
    s.scale.set(sc, sc * 0.5, 1);
    s.position.set((Math.random() - 0.5) * 12000, -600 + Math.random() * 80, (Math.random() - 0.5) * 12000);
    scene.add(s);
    clouds.push(s);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // Clouds stream past as the bomber flies; `speed` scales with throttle.
  function updateClouds(dt, speed) {
    const v = 60 * speed;
    for (const c of clouds) {
      c.position.z += v * dt;
      if (c.position.z > 6000) c.position.z -= 12000;
    }
  }

  return { THREE, renderer, scene, camera, sunDir, resize, updateClouds, render: () => renderer.render(scene, camera) };
}

// Soft, fluffy cloud puff drawn to a canvas texture.
function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const cx = 128, cy = 128;
  // Several overlapping soft blobs for an irregular fluffy edge.
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 70;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6;
    const rad = 40 + Math.random() * 55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
