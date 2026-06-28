// Programmatic building silhouettes, shared by the briefing illustration and
// the bomb-run ground. Each draw fn is centered on (cx, cy); `s` is a size unit.
// Keep them visually DISTINCT so a player can recognize the briefed one.

function rect(ctx, x, y, w, h) {
  ctx.fillRect(x, y, w, h);
}

export const TARGET_SHAPES = {
  // Ball-bearing factory: long hall + sawtooth roof + two chimneys.
  factory(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    rect(ctx, cx - 2.2 * s, cy - 0.6 * s, 4.4 * s, 1.4 * s);
    // sawtooth roof
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = cx - 2.2 * s + i * 0.9 * s;
      ctx.moveTo(x, cy - 0.6 * s);
      ctx.lineTo(x + 0.45 * s, cy - 1.1 * s);
      ctx.lineTo(x + 0.9 * s, cy - 0.6 * s);
    }
    ctx.fill();
    // chimneys
    rect(ctx, cx - 1.6 * s, cy - 1.9 * s, 0.35 * s, 1.3 * s);
    rect(ctx, cx + 1.2 * s, cy - 2.1 * s, 0.35 * s, 1.5 * s);
  },

  // Rail bridge: deck + arched spans + piers.
  bridge(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    rect(ctx, cx - 2.6 * s, cy - 0.15 * s, 5.2 * s, 0.4 * s);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.18 * s;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * 1.0 * s, cy - 0.15 * s, 0.5 * s, Math.PI, 0);
      ctx.stroke();
    }
    rect(ctx, cx - 2.6 * s, cy + 0.25 * s, 0.3 * s, 1.1 * s);
    rect(ctx, cx + 2.3 * s, cy + 0.25 * s, 0.3 * s, 1.1 * s);
  },

  // Oil refinery: row of cylindrical tanks + a distillation tower.
  refinery(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      const x = cx - 1.8 * s + i * 1.0 * s;
      ctx.beginPath();
      ctx.ellipse(x, cy + 0.2 * s, 0.42 * s, 0.55 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    rect(ctx, cx + 1.7 * s, cy - 1.6 * s, 0.5 * s, 2.2 * s);
    rect(ctx, cx + 1.55 * s, cy - 1.9 * s, 0.8 * s, 0.35 * s);
  },

  // Airfield: runway strip + two hangars.
  airfield(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.18);
    rect(ctx, -2.6 * s, -0.22 * s, 5.2 * s, 0.44 * s);
    ctx.restore();
    // hangars (rounded-top sheds)
    for (const dx of [-1.4, 1.4]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * s - 0.7 * s, cy + 1.2 * s);
      ctx.lineTo(cx + dx * s - 0.7 * s, cy + 0.3 * s);
      ctx.arc(cx + dx * s, cy + 0.3 * s, 0.7 * s, Math.PI, 0);
      ctx.lineTo(cx + dx * s + 0.7 * s, cy + 1.2 * s);
      ctx.fill();
    }
  },

  // Rail marshalling yard: bundle of parallel tracks + a roundhouse.
  rail_yard(ctx, cx, cy, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.12 * s;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 2.4 * s, cy + i * 0.3 * s);
      ctx.lineTo(cx + 1.4 * s, cy + i * 0.3 * s);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + 2.0 * s, cy, 0.95 * s, 0, Math.PI * 2);
    ctx.fill();
  },
};

export const SHAPE_NAMES = {
  factory: 'Factory',
  bridge: 'Rail Bridge',
  refinery: 'Oil Refinery',
  airfield: 'Airfield',
  rail_yard: 'Rail Yard',
};

export function drawShape(ctx, shape, cx, cy, s, color) {
  const fn = TARGET_SHAPES[shape] || TARGET_SHAPES.factory;
  fn(ctx, cx, cy, s, color);
}
