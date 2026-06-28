// requestAnimationFrame loop with a clamped dt so a backgrounded tab can't
// fast-forward the simulation when it returns.

export function startLoop(step) {
  let last = null;
  function frame(now) {
    if (last === null) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp ~20fps worst-case
    step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
