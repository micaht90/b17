// Mission definitions. One mission ships now; the shape is campaign-ready
// (add entries, set `next`, persist progress in scoring.js).

export const MISSIONS = [
  {
    id: 'schweinfurt',
    name: 'Schweinfurt Raid',
    briefing:
      'Target: the ball-bearing works at Schweinfurt. Without bearings the ' +
      'enemy war machine grinds to a halt. Expect heavy fighter resistance ' +
      'and a wall of flak over the target. Study the factory below — you must ' +
      'pick it out from the bombsight yourself.',
    target: {
      name: 'Ball-Bearing Factory',
      description: 'Long assembly hall, sawtooth roof, two chimneys.',
      shape: 'factory',
    },

    distance: 100,            // plane.position runs 0 -> distance
    startFuel: 100,
    startAmmoPerStation: 80,
    cruiseAltitude: 25000,
    minAltitudeToProceed: 18000,

    // Fighter waves keyed to route progress (`at`). Each spawns `count`
    // fighters in one arc, `interval` seconds apart.
    waves: [
      { at: 12, arc: 'FRONT', count: 2, interval: 1.6 },
      { at: 26, arc: 'HIGH',  count: 2, interval: 1.4 },
      { at: 30, arc: 'REAR',  count: 2, interval: 1.6 },
      { at: 46, arc: 'LEFT',  count: 2, interval: 1.5 },
      { at: 50, arc: 'RIGHT', count: 2, interval: 1.5 },
      { at: 72, arc: 'LOW',   count: 2, interval: 1.5 },
      { at: 78, arc: 'FRONT', count: 2, interval: 1.3 },
      { at: 84, arc: 'HIGH',  count: 2, interval: 1.3 },
    ],

    // Flak is ambient pressure near the target.
    flakZones: [{ from: 66, to: 96, intensity: 0.7 }],

    // Force the dump-fuel / jettison-ammo decision mid-route.
    decisionTrigger: { at: 58 },

    // Bomb run: the real target plus decoys scrolling past the bombsight.
    bombRun: {
      decoyShapes: ['rail_yard', 'refinery', 'airfield', 'bridge'],
      buildingCount: 5,
      dropWindowRadius: 46, // px from bombsight center counted as a hit
    },

    scoring: {
      bombHit: 1000,
      accuracyBonus: 800,    // scaled by how centered the drop was
      fighterKill: 120,
      survivalBonus: 600,    // scaled by remaining health
      fuelBonus: 4,          // per % fuel remaining
    },

    next: null,
  },
];

export function getMission(i = 0) {
  return MISSIONS[i % MISSIONS.length];
}
