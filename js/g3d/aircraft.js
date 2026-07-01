// Low-poly WWII aircraft: enemy fighters and friendly B-17s. These stay cheap
// enough for mobile, but use silhouette details that read clearly at distance.

import * as THREE from 'three';

function standard(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.25,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
}

function halfWing(side, span, rootChord, tipChord, thickness, sweep, dihedral, material) {
  const xRoot = 0;
  const xTip = side * span;
  const yRoot = 0;
  const yTip = dihedral;
  const rootLead = -rootChord * 0.5;
  const rootTrail = rootChord * 0.5;
  const tipLead = sweep - tipChord * 0.5;
  const tipTrail = sweep + tipChord * 0.5;
  const t = thickness * 0.5;
  const v = [
    xRoot, yRoot + t, rootLead, xRoot, yRoot + t, rootTrail, xTip, yTip + t, tipTrail, xTip, yTip + t, tipLead,
    xRoot, yRoot - t, rootLead, xRoot, yRoot - t, rootTrail, xTip, yTip - t, tipTrail, xTip, yTip - t, tipLead,
  ];
  const ix = [
    0, 1, 2, 0, 2, 3,       // top
    4, 6, 5, 4, 7, 6,       // bottom
    0, 4, 5, 0, 5, 1,       // root edge
    3, 2, 6, 3, 6, 7,       // tip edge
    0, 3, 7, 0, 7, 4,       // leading edge
    1, 5, 6, 1, 6, 2,       // trailing edge
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function wingPair(span, rootChord, tipChord, thickness, sweep, dihedral, material) {
  const g = new THREE.Group();
  g.add(halfWing(-1, span, rootChord, tipChord, thickness, sweep, dihedral, material));
  g.add(halfWing(1, span, rootChord, tipChord, thickness, sweep, dihedral, material));
  return g;
}

function triangleFin(height, length, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -length * 0.5,
    0, 0, length * 0.5,
    0, height, length * 0.25,
  ], 3));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function propAssembly(radius, z, bladeColor = 0x111418) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 36),
    new THREE.MeshBasicMaterial({ color: 0xd8e3e8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.position.z = z;
  const bladeMat = standard(bladeColor, { roughness: 0.42, metalness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.16, radius * 1.55, 0.035), bladeMat);
    b.position.z = z - 0.02;
    b.rotation.z = (i * Math.PI * 2) / 3;
    g.add(b);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.14, 10, 8), standard(0x242a2f, { metalness: 0.45 }));
  hub.position.z = z - 0.05;
  g.add(disc, hub);
  g.userData.spin = true;
  return g;
}

function addStripe(group, x, z, w, d, material) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), material);
  s.position.set(x, 0.125, z);
  group.add(s);
}

// Single-seat WWII fighter (FW-190 flavour). Nose points toward -Z so a
// THREE lookAt() orientation keeps the attack run readable.
export function makeFighter() {
  const g = new THREE.Group();
  const body = standard(0x656d51, { roughness: 0.72, metalness: 0.18 });
  const dark = standard(0x2a3028, { roughness: 0.65, metalness: 0.22 });
  const belly = standard(0x9ca8ad, { roughness: 0.68, metalness: 0.2 });
  const glass = standard(0x415261, { roughness: 0.18, metalness: 0.2 });
  const accent = standard(0xb43a2d, { roughness: 0.45, metalness: 0.15 });
  const mark = standard(0xd7d8c6, { roughness: 0.72, metalness: 0.05 });

  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 4.6, 4, 14), body);
  fus.rotation.x = Math.PI / 2;
  fus.position.z = 0.12;
  fus.scale.set(1.05, 0.88, 1.0);

  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.52, 0.78, 18), dark);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = -2.44;

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.82, 18), accent);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -3.24;
  const prop = propAssembly(1.85, -3.02);

  const wings = wingPair(4.7, 1.75, 0.86, 0.14, 0.28, 0.13, body);
  wings.position.set(0, -0.04, -0.35);
  addStripe(wings, -2.45, -0.35, 0.16, 1.45, mark);
  addStripe(wings, 2.45, -0.35, 0.16, 1.45, mark);

  const tailH = wingPair(1.7, 0.9, 0.46, 0.11, 0.1, 0.05, body);
  tailH.position.set(0, 0.04, 2.48);
  const fin = triangleFin(1.1, 1.15, body);
  fin.position.set(0, 0.22, 2.48);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 8), glass);
  canopy.position.set(0, 0.48, -0.7);
  canopy.scale.set(0.82, 0.55, 1.5);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 3.5), belly);
  keel.position.set(0, -0.46, 0.05);

  for (const x of [-1.15, 1.15]) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), dark);
    gun.rotation.x = -Math.PI / 2;
    gun.position.set(x, -0.04, -1.22);
    g.add(gun);
  }

  g.add(fus, cowl, spinner, prop, wings, tailH, fin, canopy, keel);
  g.userData.kind = 'fighter';
  g.userData.prop = prop;
  return g;
}

export function makeBomber() {
  const g = new THREE.Group();
  const body = standard(0x7d858b, { metalness: 0.38, roughness: 0.5 });
  const dark = standard(0x2f363c, { metalness: 0.42, roughness: 0.45 });
  const glass = standard(0x5b7280, { metalness: 0.25, roughness: 0.2 });
  const mark = standard(0xd5d9d3, { roughness: 0.55, metalness: 0.05 });

  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.82, 11.3, 5, 16), body);
  fus.rotation.x = Math.PI / 2;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), glass);
  nose.position.z = -5.9;
  nose.scale.set(0.82, 0.82, 0.58);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), glass);
  cockpit.position.set(0, 0.68, -3.0);
  cockpit.scale.set(1.2, 0.45, 0.9);

  const wing = wingPair(10.8, 2.65, 1.45, 0.34, 0.32, 0.22, body);
  wing.position.set(0, -0.05, -0.85);
  addStripe(wing, -5.6, -0.85, 0.22, 2.1, mark);
  addStripe(wing, 5.6, -0.85, 0.22, 2.1, mark);

  const tailH = wingPair(4.25, 1.45, 0.75, 0.22, 0.12, 0.08, body);
  tailH.position.set(0, 0.2, 5.65);
  const fin = triangleFin(2.3, 1.8, body);
  fin.position.set(0, 0.35, 5.65);

  for (const x of [-6.7, -3.25, 3.25, 6.7]) {
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.85, 4, 10), dark);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(x, -0.22, -1.6);
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.44, 0.4, 14), dark);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(x, -0.22, -2.62);
    const prop = propAssembly(1.04, -2.88, 0x171a1e);
    prop.position.x = x;
    prop.position.y = -0.22;
    g.add(nacelle, cowl, prop);
  }

  for (const p of [[0, 0.95, -0.3], [0, -0.68, 1.8], [0, 0.15, 5.4]]) {
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 7), dark);
    turret.position.set(...p);
    turret.scale.set(1, 0.65, 1);
    g.add(turret);
  }

  const tailGun = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), dark);
  tailGun.rotation.x = Math.PI / 2;
  tailGun.position.set(0, 0.08, 6.6);

  g.add(fus, nose, cockpit, wing, tailH, fin, tailGun);
  g.userData.kind = 'bomber';
  return g;
}
