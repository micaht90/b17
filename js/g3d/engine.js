// 3D engine: renderer, atmospheric sky (gradient + sun glow + haze), a layered
// cloud field at altitude with an undercast below, lighting, and the loop.

import * as THREE from 'three';

export function createEngine(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 8000);

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

  // --- Clouds (clusters of soft white billboards) -------------------------------
  // A smooth single-gradient puff texture + pure white sprites avoids the grainy
  // colour artifacts; clustering a few per cloud gives a fluffy shape.
  const cloudTex = makeCloudTexture();
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false });
  const cloudMatFar = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.6, depthWrite: false });
  const clouds = [];
  function cloud(mat, cx, cy, cz, base) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Sprite(mat);
      const sc = base * (0.6 + Math.random() * 0.7);
      s.scale.set(sc, sc * 0.6, 1);
      s.position.set((Math.random() - 0.5) * base * 1.1, (Math.random() - 0.5) * base * 0.22, (Math.random() - 0.5) * base * 1.1);
      g.add(s);
    }
    g.position.set(cx, cy, cz);
    scene.add(g); clouds.push(g);
  }
  for (let i = 0; i < 40; i++) cloud(cloudMat, (Math.random() - 0.5) * 5200, -50 + Math.random() * 230, (Math.random() - 0.5) * 5200, 360 + Math.random() * 320);

  // Distant undercast deck (skipped when a real terrain is used below).
  if (opts.deck !== false) {
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(16000, 16000),
      new THREE.MeshStandardMaterial({ color: '#aeb9bf', roughness: 1 }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = -650;
    scene.add(deck);
  }
  for (let i = 0; i < 28; i++) cloud(cloudMatFar, (Math.random() - 0.5) * 12000, -600 + Math.random() * 80, (Math.random() - 0.5) * 12000, 1100 + Math.random() * 700);

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

// A single smooth white puff: one clean radial gradient, no banding/grain.
function makeCloudTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
