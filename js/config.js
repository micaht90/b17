// Central tunables. Keep gameplay numbers here so balancing is one file.

export const COLORS = {
  skyTop: '#2f5f93',
  skyMid: '#6f9ec4',
  skyBottom: '#c4d8e8',
  cloud: 'rgba(245,249,252,0.85)',
  ground: '#586b3a',
  groundDark: '#3f4f2a',
  groundFar: '#7c8a5c',
  horizon: '#e6eef4',
  fighter: '#23272d',
  fighterAccent: '#aeb6bf',
  fighterCanopy: '#7fd0e6',
  flak: '#1d1d1d',
  flakCore: '#5a5147',
  tracer: '#ffe08a',
  tracerEnemy: '#ff6a4d',
  crosshair: '#ff5a4d',
  crosshairJam: '#9aa3ad',
  hud: '#d7e3ec',
  hudDim: '#7e8c99',
  panel: 'rgba(12,18,24,0.82)',
  panelEdge: '#33424f',
  good: '#5fc77a',
  warn: '#e6b84d',
  bad: '#e0584a',
  fire: '#c2453a',
  fireHot: '#ff6f5e',
  heat: '#ff8a3d',
  smoke: 'rgba(40,40,44,0.55)',
};

export const GAME = {
  // Route pacing
  cruiseSpeed: 2.6,           // mission "distance units" per second (slower mission)

  // Resources / weight
  fuelBurnPerSec: 0.95,
  weightFuelTerm: 0.5,
  flakDamage: 9,
  flakLowAltMultiplier: 2.0,

  // Bomb run
  bombScrollSpeed: 140,
  buildingSpacing: 270,
};

// Weighty-but-direct gunnery: heavy aim, spread that blooms with heat/recoil,
// overheating with jams. Bullets hit where pointed (no leading required).
export const GUN = {
  aimLerp: 0.14,              // lower = heavier, slower-settling aim
  fireRate: 6.5,             // rounds/sec while held
  spreadBaseDeg: 1.4,        // inherent cone at rest (degrees, mapped to px by range)
  spreadPx: 14,              // base spread radius in px
  bloomPerShot: 7,           // px added to transient bloom per shot
  bloomMax: 80,              // cap on transient bloom
  bloomDecayPerSec: 90,      // px/sec the bloom settles when not firing
  spreadPerHeat: 34,         // extra px spread at full heat
  recoilKick: 9,             // px upward jump per shot (settles via bloom/aim)
  heatPerShot: 0.022,        // ~45 sustained rounds to overheat
  heatCoolPerSec: 0.32,      // cooling when not firing
  heatJamAt: 1.0,            // overheats -> jam
  heatResumeAt: 0.55,        // must cool to here before firing again
  fighterHp: 3,              // bullet hits to down a fighter
  hitRadiusScale: 0.5,       // fighter hit radius = size * this
};

// Fighter attack-run behaviour.
export const FIGHTER = {
  ingressSpeed: 0.17,    // approach progress t/sec (slow, gives time to engage)
  passAt: 0.82,          // t where the firing pass begins
  warnTime: 0.7,         // telegraph (sec) before the first shot of a pass
  shotsPerPass: 3,
  shotInterval: 0.34,
  shotHitChance: 0.6,    // chance an unanswered pass-shot connects
  breakSpeed: 0.95,      // t/sec while peeling away after a pass
  weaveAmp: 0.14,        // lateral weave amplitude (view fractions)
  weaveRate: 1.6,        // weave oscillation speed
};

// Damage model: how hits are distributed across the airframe.
export const DAMAGE = {
  engines: 4,
  // Relative weights for where a connecting hit lands.
  locationWeights: { engine: 0.2, fuel: 0.15, gun: 0.16, gunner: 0.14, hull: 0.35 },
  hullLossFighter: 5,
  hullLossFlak: 8,
  engineFuelPenaltyEach: 0.22, // +22% fuel burn per dead engine
  fuelLeakPerHit: 0.6,         // extra %/sec fuel loss per fuel-tank hit
  gunnerFireRatePenalty: 0.45, // wounded gunner -> slower fire at that station
  gunnerSpreadPenalty: 1.6,    // wounded gunner -> wider spread
};

// Default key bindings (desktop fallback). Index keys switch stations.
export const KEYS = {
  fire: [' ', 'Spacebar'],
  stations: { '1': 'nose', '2': 'top', '3': 'ball', '4': 'tail', '5': 'waistL', '6': 'waistR' },
};
