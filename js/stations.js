// The six gun stations, their 1:1 attack-arc mapping, and the traverse cone
// each gun can physically cover (as fractions of the view, x/y in 0..1).
// Order matters: it's the layout order on the HUD plane diagram.

export const STATIONS = [
  { id: 'nose',   key: '1', arc: 'FRONT', label: 'Nose',        short: 'NOSE',  traverse: { minX: 0.12, maxX: 0.88, minY: 0.18, maxY: 0.74 } },
  { id: 'top',    key: '2', arc: 'HIGH',  label: 'Top Turret',  short: 'TOP',   traverse: { minX: 0.08, maxX: 0.92, minY: 0.08, maxY: 0.60 } },
  { id: 'ball',   key: '3', arc: 'LOW',   label: 'Ball Turret', short: 'BALL',  traverse: { minX: 0.18, maxX: 0.82, minY: 0.34, maxY: 0.86 } },
  { id: 'waistL', key: '5', arc: 'LEFT',  label: 'Left Waist',  short: 'L.WST', traverse: { minX: 0.06, maxX: 0.62, minY: 0.20, maxY: 0.78 } },
  { id: 'waistR', key: '6', arc: 'RIGHT', label: 'Right Waist', short: 'R.WST', traverse: { minX: 0.38, maxX: 0.94, minY: 0.20, maxY: 0.78 } },
  { id: 'tail',   key: '4', arc: 'REAR',  label: 'Tail Gun',    short: 'TAIL',  traverse: { minX: 0.16, maxX: 0.84, minY: 0.16, maxY: 0.76 } },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export function arcOf(stationId) {
  return STATION_BY_ID[stationId].arc;
}

export function activeArc(state) {
  return arcOf(state.activeStation);
}

// Clamp an aim point to the active station's traverse cone (in screen px).
export function clampToTraverse(stationId, x, y, vp) {
  const t = STATION_BY_ID[stationId].traverse;
  return {
    x: Math.max(vp.w * t.minX, Math.min(vp.w * t.maxX, x)),
    y: Math.max(vp.h * t.minY, Math.min(vp.h * t.maxY, y)),
  };
}

export function traverseRect(stationId, vp) {
  const t = STATION_BY_ID[stationId].traverse;
  return { x: vp.w * t.minX, y: vp.h * t.minY, w: vp.w * (t.maxX - t.minX), h: vp.h * (t.maxY - t.minY) };
}
