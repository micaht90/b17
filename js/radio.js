// Crew radio: written callouts that scroll and fade. Other systems push events
// here; the HUD renders the feed.

import { RADIO } from './config.js';

const CLOCK = {
  FRONT: 'twelve o\'clock',
  REAR: 'six o\'clock',
  LEFT: 'nine o\'clock',
  RIGHT: 'three o\'clock',
  HIGH: 'twelve o\'clock high',
  LOW: 'six o\'clock low',
};

export function clockOf(arc) {
  return CLOCK[arc] || 'close';
}

export function pushRadio(state, text, level = 'info') {
  // Skip exact duplicate of the most recent line within a short window.
  const last = state.radio[state.radio.length - 1];
  if (last && last.text === text && last.t > RADIO.msgLife - 1.2) return;
  state.radio.push({ text, level, t: RADIO.msgLife });
  while (state.radio.length > RADIO.maxLines) state.radio.shift();
}

export function updateRadio(state, dt) {
  for (let i = state.radio.length - 1; i >= 0; i--) {
    if ((state.radio[i].t -= dt) <= 0) state.radio.splice(i, 1);
  }
}

// --- Event helpers -----------------------------------------------------------

export function radioBandit(state, arc) {
  const calls = ['Bandit', 'Fighter', 'Bogey'];
  pushRadio(state, `${calls[Math.floor(Math.random() * calls.length)]}, ${clockOf(arc)}!`, 'warn');
}

export function radioIncoming(state, arc) {
  pushRadio(state, `Incoming, ${clockOf(arc)} — he's boring in!`, 'alert');
}

export function radioKill(state) {
  const calls = ['Got him!', 'Splash one!', 'He\'s going down!', 'Scratch one bandit!'];
  pushRadio(state, calls[Math.floor(Math.random() * calls.length)], 'info');
}

export function radioHit(state, location) {
  switch (location) {
    case 'engine': pushRadio(state, 'We took one in an engine!', 'alert'); break;
    case 'fuel': pushRadio(state, 'We\'re losing fuel — tank\'s hit!', 'alert'); break;
    case 'gun': pushRadio(state, 'A gun\'s knocked out!', 'warn'); break;
    case 'gunner': pushRadio(state, 'Gunner\'s hit!', 'alert'); break;
    default: pushRadio(state, 'We\'re hit!', 'warn');
  }
}

export function radioFire(state, n) {
  pushRadio(state, `Number ${n}'s on fire! Feather it!`, 'alert');
}
