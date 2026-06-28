// Mission definitions. One mission ships now; the shape is campaign-ready
// (add entries, set `next`, persist progress in scoring.js).

export const MISSIONS = [
  {
    id: 'schweinfurt',
    name: 'Schweinfurt Raid',
    briefing:
      'Target: the ball-bearing works at Schweinfurt. Without bearings the ' +
      'enemy war machine grinds to a halt. Fighters attack in passes — track ' +
      'them in, fire short bursts so your guns don\'t overheat, and drive them ' +
      'off before they bore in. Then study the factory: you must pick it out ' +
      'from the bombsight yourself.',
    target: {
      name: 'Ball-Bearing Factory',
      description: 'Long assembly hall, sawtooth roof, two chimneys.',
      shape: 'factory',
    },

    distance: 100,
    startFuel: 100,
    startAmmoPerStation: 90,
    cruiseAltitude: 25000,
    minAltitudeToProceed: 18000,

    // Fewer fighters, well spaced — passes you can actually track and answer.
    waves: [
      { at: 8,  arc: 'FRONT', count: 1, interval: 2.5 },
      { at: 18, arc: 'HIGH',  count: 2, interval: 3.0 },
      { at: 30, arc: 'REAR',  count: 1, interval: 2.5 },
      { at: 42, arc: 'LEFT',  count: 1, interval: 2.5 },
      { at: 50, arc: 'RIGHT', count: 1, interval: 2.5 },
      { at: 70, arc: 'LOW',   count: 2, interval: 3.0 },
      { at: 82, arc: 'FRONT', count: 1, interval: 2.5 },
      { at: 90, arc: 'HIGH',  count: 1, interval: 2.5 },
    ],

    flakZones: [{ from: 66, to: 96, intensity: 0.7 }],

    decisionTrigger: { at: 58 },

    bombRun: {
      decoyShapes: ['rail_yard', 'refinery', 'airfield', 'bridge'],
      buildingCount: 5,
      dropWindowRadius: 46,
      scrollSpeed: 140,
    },

    scoring: {
      bombHit: 1000,
      accuracyBonus: 800,
      fighterKill: 120,
      survivalBonus: 600,
      fuelBonus: 4,
    },

    next: null,
  },
];

export function getMission(i = 0) {
  return MISSIONS[i % MISSIONS.length];
}
