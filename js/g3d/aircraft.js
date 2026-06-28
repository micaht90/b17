// Simple low-poly WWII aircraft: enemy fighters and friendly B-17s.

import * as THREE from 'three';

export function makeFighter() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2b3037, metalness: 0.3, roughness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 4.2, 4, 10), body);
  fus.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.22, 1.4), body);
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 0.8), body);
  tailH.position.z = 2.4;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.8), body);
  fin.position.set(0, 0.5, 2.4);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x9a2a22 }));
  spinner.rotation.x = -Math.PI / 2; spinner.position.z = -2.6;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6fd0e6, metalness: 0.1, roughness: 0.2 }));
  canopy.position.set(0, 0.4, -0.5); canopy.scale.set(1, 0.7, 1.6);
  g.add(fus, wing, tailH, fin, spinner, canopy);
  g.userData.kind = 'fighter';
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
