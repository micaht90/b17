// 3D engine: renderer, atmospheric sky (gradient + sun glow + haze), a layered
// cloud field at altitude with an undercast below, lighting, and the loop.

import * as THREE from 'three';

export function createEngine(canvas, opts = {}) {
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
  // Each cloud is a single soft, blurred billboard (avoids the hard-edged
  // overlapping-blob artifacts). Slight tint variation for depth.
  const cloudTex = makeCloudTexture();
  const clouds = [];
  function makeCloud(scale, tint) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, color: tint });
    const s = new THREE.Sprite(mat);
    s.scale.set(scale, scale * 0.58, 1);
    return s;
  }
  // Scattered cumulus around flight level.
  for (let i = 0; i < 44; i++) {
    const sc = 360 + Math.random() * 420;
    const s = makeCloud(sc, new THREE.Color().setHSL(0.6, 0.05, 0.92 + Math.random() * 0.06));
    s.position.set((Math.random() - 0.5) * 5200, -60 + Math.random() * 240, (Math.random() - 0.5) * 5200);
    scene.add(s); clouds.push(s);
  }
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
  for (let i = 0; i < 34; i++) {
    const s = makeCloud(900 + Math.random() * 800, 0xffffff);
    s.material.opacity = 0.7;
    s.position.set((Math.random() - 0.5) * 12000, -600 + Math.random() * 80, (Math.random() - 0.5) * 12000);
    scene.add(s); clouds.push(s);
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

// One soft, blurred cumulus puff on a canvas texture — heavy blur keeps the
// edges smooth so the billboards read as fluffy cloud, not hard blobs.
function makeCloudTexture() {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(14px)';
  const cx = N / 2, cy = N / 2;
  // A flat-bottomed cumulus: lumps along the top, soft and low-alpha so they
  // accumulate into a smooth body.
  for (let i = 0; i < 11; i++) {
    const x = cx + (Math.random() - 0.5) * 200;
    const y = cy - 30 + (Math.random() - 0.5) * 70;
    const rad = 70 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  return tex;
}
