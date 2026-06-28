// Score calculation + a tiny localStorage best-score store (campaign-ready).

export function computeScore(state) {
  const s = state.mission.scoring;
  const r = state.bomb && state.bomb.result;
  const survived = state.plane.health > 0;

  const breakdown = [];
  let total = 0;

  if (r && r.hit) {
    breakdown.push({ label: 'Target destroyed', value: s.bombHit });
    total += s.bombHit;
    const acc = Math.round(s.accuracyBonus * r.accuracy);
    breakdown.push({ label: `Bombing accuracy (${Math.round(r.accuracy * 100)}%)`, value: acc });
    total += acc;
  } else {
    breakdown.push({ label: 'Target missed', value: 0 });
  }

  const killPts = state.kills * s.fighterKill;
  breakdown.push({ label: `Fighters downed (${state.kills})`, value: killPts });
  total += killPts;

  if (survived) {
    const surv = Math.round(s.survivalBonus * (state.plane.health / 100));
    breakdown.push({ label: `Made it home (${Math.round(state.plane.health)}% hull)`, value: surv });
    total += surv;
    const fuel = Math.round(s.fuelBonus * state.plane.fuel);
    breakdown.push({ label: `Fuel reserve (${Math.round(state.plane.fuel)}%)`, value: fuel });
    total += fuel;
  } else {
    breakdown.push({ label: 'Fortress lost', value: 0 });
  }

  return {
    won: survived,
    targetHit: !!(r && r.hit),
    score: Math.max(0, total),
    breakdown,
  };
}

const KEY = 'b17_best_score';

export function loadBest() {
  try {
    return parseInt(localStorage.getItem(KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score) {
  try {
    if (score > loadBest()) localStorage.setItem(KEY, String(score));
  } catch {
    /* ignore (private mode etc.) */
  }
}
