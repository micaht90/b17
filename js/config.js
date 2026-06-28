// Central tunables. Keep gameplay numbers here so balancing is one file.

export const COLORS = {
  skyTop: '#3b6ea5',
  skyBottom: '#bcd4e6',
  ground: '#5a6b3b',
  groundDark: '#41502b',
  horizon: '#dfeaf2',
  fighter: '#2b2f36',
  fighterAccent: '#9aa3ad',
  flak: '#2a2a2a',
  flakCore: '#5a5147',
  tracer: '#ffd34d',
  crosshair: '#ff5a4d',
  hud: '#d7e3ec',
  hudDim: '#7e8c99',
  panel: 'rgba(12,18,24,0.82)',
  panelEdge: '#33424f',
  good: '#5fc77a',
  warn: '#e6b84d',
  bad: '#e0584a',
  fire: '#c2453a',
  fireHot: '#ff6f5e',
};

export const GAME = {
  // Logical/world pacing
  cruiseSpeed: 3.2,          // mission "distance units" advanced per second
  fireRate: 7,               // shots per second when firing held
  crosshairLerp: 0.30,       // crosshair smoothing toward aim point (0..1 per frame@60)

  // Combat
  fighterApproachSpeed: 0.16, // approach progress t per second (slow rise to ~1)
  fighterAttackAt: 0.62,      // t at which a fighter starts shooting the plane
  fighterFireInterval: 1.1,   // seconds between a fighter's passes/hits
  fighterPasses: 3,           // hits a fighter makes before peeling off
  fighterDamage: 6,           // health lost per unanswered fighter hit
  fighterHp: 2,               // gunfire hits to destroy a fighter
  hitBaseRadius: 30,          // crosshair hit radius (px) at close range, scaled by size
  threatT: 0.45,              // t above which a fighter flashes its station on the HUD

  // Resources / weight
  fuelBurnPerSec: 1.05,       // base fuel %/sec
  weightFuelTerm: 0.5,        // weight contribution scaling
  flakDamage: 7,              // health per flak burst that connects
  flakLowAltMultiplier: 2.0,  // extra flak damage when pressing on at low altitude

  // Bomb run
  bombScrollSpeed: 150,       // px/sec the ground scrolls past the bombsight
  buildingSpacing: 260,       // px between buildings in the bomb run
};

// Default key bindings (desktop fallback). Index keys switch stations.
export const KEYS = {
  fire: [' ', 'Spacebar'],
  stations: { '1': 'nose', '2': 'top', '3': 'ball', '4': 'tail', '5': 'waistL', '6': 'waistR' },
};
