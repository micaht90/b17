// The six gun stations and their 1:1 attack-arc mapping.
// Order matters: it's the layout order on the HUD plane diagram (nose->tail).

export const STATIONS = [
  { id: 'nose',   key: '1', arc: 'FRONT', label: 'Nose',       short: 'NOSE' },
  { id: 'top',    key: '2', arc: 'HIGH',  label: 'Top Turret', short: 'TOP'  },
  { id: 'ball',   key: '3', arc: 'LOW',   label: 'Ball Turret',short: 'BALL' },
  { id: 'waistL', key: '5', arc: 'LEFT',  label: 'Left Waist', short: 'L.WST'},
  { id: 'waistR', key: '6', arc: 'RIGHT', label: 'Right Waist',short: 'R.WST'},
  { id: 'tail',   key: '4', arc: 'REAR',  label: 'Tail Gun',   short: 'TAIL' },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export function arcOf(stationId) {
  return STATION_BY_ID[stationId].arc;
}

export function activeArc(state) {
  return arcOf(state.activeStation);
}
