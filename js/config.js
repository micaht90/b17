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
  crosshairDisabled: '#9aa3ad',
  hud: '#d7e3ec',
  hudDim: '#7e8c99',
  panel: 'rgba(12,18,24,0.82)',
  panelEdge: '#33424f',
  good: '#5fc77a',
  warn: '#e6b84d',
  bad: '#e0584a',
  fire: '#c2453a',
  fireHot: '#ff6f5e',
  smoke: 'rgba(40,40,44,0.55)',
};

export const GAME = {
  // Route pacing
  cruiseSpeed: 2.0,           // mission "distance units" per second (slow, deliberate)

  // Resources / weight
  fuelBurnPerSec: 0.95,
  weightFuelTerm: 0.5,
  flakDamage: 9,
  flakLowAltMultiplier: 2.0,

  // Bomb run
  bombScrollSpeed: 140,
  buildingSpacing: 270,
};

// Weighty-but-direct gunnery: heavy aim, recoil bloom, and ammo limits.
// Bullets hit where pointed (no leading required).
export const GUN = {
  aimLerp: 0.16,              // lower = heavier, slower-settling aim
  fireRate: 6,               // rounds/sec while held (single mount)
  spreadPx: 9,               // base spread radius in px — short bursts are tight
  bloomPerShot: 5,           // px added to transient bloom per shot
  bloomMax: 50,              // cap on transient bloom
  bloomDecayPerSec: 95,      // px/sec the bloom settles when not firing
  recoilKick: 2.5,           // subtle muzzle climb per shot (spread bloom is the real penalty)
  fighterHp: 3,              // bullet hits to down a fighter
  hitRadiusScale: 0.62,      // fighter hit radius = size * this
};

// Fighter attack-run behaviour.
export const FIGHTER = {
  ingressSpeed: 0.11,    // approach progress t/sec (slow, lots of time to react)
  maxConcurrent: 2,      // never more than this attacking at once
  passAt: 0.82,          // t where the firing pass begins
  warnTime: 1.1,         // telegraph (sec) before the first shot of a pass
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

// Cockpit / pilot controls.
export const CONTROL = {
  throttleMin: 0.7,          // economy: slower, sips fuel
  throttleMax: 1.4,          // full power: faster through flak, drinks fuel
  throttleStep: 0.15,
  evadeDuration: 4.0,        // seconds a corkscrew lasts
  evadeCooldown: 6.0,
  evadeFlakMult: 0.3,        // flak hit chance while evading
  evadeAimPenalty: 2.2,      // gunner spread multiplier while evading
  braceDuration: 1.6,        // seconds a brace protects
  braceFlakMult: 0.4,        // flak damage taken while braced
};

// Engine fires from battle damage.
export const FIRE = {
  igniteChance: 0.5,         // chance an engine hit also starts a fire
  dpsHealth: 2.6,            // hull %/sec lost per burning engine
  spreadPerSec: 0.06,       // chance/sec a fire knocks out another engine
};

// Crew radio chatter.
export const RADIO = {
  msgLife: 5.5,
  maxLines: 4,
};

// Touch aiming: relative (trackpad-style) so your finger never covers the target.
export const AIM = {
  touchSensitivity: 1.35,
};

// Gun fitments per station (B-17G): turrets are twin .50 cals, the rest single.
export const GUNS = {
  nose:  { type: 'single', name: 'Cheek .50' },
  top:   { type: 'twin',   name: 'Top Turret 2x.50' },
  ball:  { type: 'twin',   name: 'Ball Turret 2x.50' },
  tail:  { type: 'twin',   name: 'Tail 2x.50' },
  waistL:{ type: 'single', name: 'Left Waist .50' },
  waistR:{ type: 'single', name: 'Right Waist .50' },
};
export const TWIN_RATE_MULT = 1.7;  // twin mounts put out more lead

// Default key bindings (desktop fallback). Index keys switch stations.
export const KEYS = {
  fire: [' ', 'Spacebar'],
  stations: { '1': 'nose', '2': 'top', '3': 'ball', '4': 'tail', '5': 'waistL', '6': 'waistR', '0': 'pilot' },
};
