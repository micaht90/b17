// Responsive canvas sizing. Renders in CSS pixels; backing store scaled by dpr.

export function createViewport(canvas) {
  const ctx = canvas.getContext('2d');
  const vp = { w: 0, h: 0, dpr: 1, isPortrait: false };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // Draw using CSS-pixel coordinates regardless of dpr.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vp.w = w;
    vp.h = h;
    vp.dpr = dpr;
    // Treat clearly taller-than-wide as portrait (rotate prompt).
    vp.isPortrait = h > w * 1.05;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  return { ctx, vp, resize };
}
