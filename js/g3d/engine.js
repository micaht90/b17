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
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.92, depthWrite: false, fog: true });
  const cloudMatFar = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.72, depthWrite: false, fog: true });
  const clouds = [];
  function cloud(mat, cx, cy, cz, base) {
    const g = new THREE.Group();
    const puffs = 4 + Math.floor(Math.random() * 4);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Sprite(mat);
      const sc = base * (0.7 + Math.random() * 0.8);
      // Lay the puffs along a flattened disc so each cloud reads as one soft mass.
      const a = Math.random() * Math.PI * 2, rr = Math.random();
      s.scale.set(sc, sc * 0.6, 1);
      s.position.set(Math.cos(a) * rr * base * 0.7, (Math.random() - 0.5) * base * 0.12, Math.sin(a) * rr * base * 0.7);
      g.add(s);
    }
    g.position.set(cx, cy, cz);
    scene.add(g); clouds.push(g);
  }
  // Scattered fair-weather layer at flight level, spaced so they stay distinct.
  for (let i = 0; i < 26; i++) cloud(cloudMat, (Math.random() - 0.5) * 5600, 20 + Math.random() * 260, (Math.random() - 0.5) * 5600, 420 + Math.random() * 320);

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
  // A low far band that melts into the horizon haze.
  for (let i = 0; i < 16; i++) cloud(cloudMatFar, (Math.random() - 0.5) * 12000, -420 + Math.random() * 120, (Math.random() - 0.5) * 12000, 1200 + Math.random() * 700);

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

// A single smooth white puff. The alpha is computed per-pixel as a gaussian so
// there is no gradient-stop banding (the source of the faint coloured rings);
// RGB is left pure white everywhere so nothing can tint the cloud.
function makeCloudTexture() {
  const N = 256, r = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x - r) / r, dy = (y - r) / r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Smooth gaussian falloff, fully transparent past the edge.
      let a = Math.exp(-dist * dist * 3.0);
      a *= Math.max(0, 1 - dist);          // guarantee a clean zero at the rim
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;    // pure white, always
      d[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
