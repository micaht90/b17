// Simple low-poly WWII aircraft: enemy fighters and friendly B-17s.

import * as THREE from 'three';

// Single-seat WWII fighter (FW-190 flavour). Nose points toward -Z so a
// THREE lookAt() (which aims the object's -Z at the target) faces it forward.
export function makeFighter() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x6b7158, metalness: 0.2, roughness: 0.7 });
  const belly = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.2, roughness: 0.7 });

  // Fuselage: a tapered body along Z (nose at -Z, tail at +Z).
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.34, 5.4, 16), body);
  fus.rotation.x = Math.PI / 2; fus.position.z = 0.2;
  // Engine cowl + spinner up front.
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 0.6 }));
  cowl.rotation.x = Math.PI / 2; cowl.position.z = -2.5;
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0x9a2a22, roughness: 0.5 }));
  spinner.rotation.x = -Math.PI / 2; spinner.position.z = -3.3;
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.2, 0.22), new THREE.MeshStandardMaterial({ color: 0x15171a }));
  prop.position.z = -3.05;

  // Wings: tapered, swept slightly, with dihedral.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.18, 1.7), body);
  wing.position.z = -0.3; wing.geometry.translate(0, 0, 0);
  // Tail surfaces.
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.0), body); tailH.position.z = 2.5;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 1.2), body); fin.position.set(0, 0.6, 2.6);
  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4a5560, metalness: 0.3, roughness: 0.25 }));
  canopy.position.set(0, 0.45, -0.7); canopy.scale.set(0.9, 0.7, 1.7);
  // Belly stripe to read top-from-bottom orientation.
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 4.5), belly); keel.position.set(0, -0.5, 0.2);

  g.add(fus, cowl, spinner, prop, wing, tailH, fin, canopy, keel);
  g.userData.kind = 'fighter';
  g.userData.prop = prop;
  return g;
}

export function makeBomber() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x767d85, metalness: 0.4, roughness: 0.55 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 11, 5, 12), body);
  fus.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(21, 0.5, 2.8), body);
  wing.position.z = -0.5;
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(8, 0.35, 1.6), body);
  tailH.position.z = 6;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 1.6), body);
  fin.position.set(0, 1.3, 6.2);
  g.add(fus, wing, tailH, fin);
  // four engine nacelles
  const eng = new THREE.MeshStandardMaterial({ color: 0x3c4147, metalness: 0.4, roughness: 0.5 });
  for (const x of [-6.5, -3.4, 3.4, 6.5]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.4, 12), eng);
    n.rotation.x = Math.PI / 2; n.position.set(x, -0.1, -1.4);
    g.add(n);
  }
  g.userData.kind = 'bomber';
  return g;
}
