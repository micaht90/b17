// Procedural WebAudio soundscape — no samples. Four thrumming radials, punchy
// .50-cal fire, flak crumps, kills, bomb run. Everything is built from noise
// buffers, oscillators, biquads and gain envelopes routed through one master
// gain + compressor so nothing clips. All methods are safe no-ops until init()
// is called from a user gesture.

export function createAudio() {
  let ctx = null;             // AudioContext, created lazily in init()
  let master = null;          // masterGain(0.5) -> compressor -> destination
  let muted = false;
  let throttle = 1.0;         // remembered so init() picks up pre-init setThrottle

  // Engine bed (steady-state nodes, built once in init)
  let bed = null;             // final fade gain for the whole bed
  let osc1 = null, osc2 = null, bedLpf = null, lfo = null;
  const BED_LEVEL = 0.16;

  // Pre-generated noise (shared by every one-shot; sources are cheap per call)
  const noiseBufs = [];       // short white-noise bursts for guns/flak/booms

  // --- Init -----------------------------------------------------------------
  function init() {
    if (ctx) { ctx.resume && ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    ctx.resume && ctx.resume();

    // Master chain: gain(0.5) -> compressor -> speakers. The compressor is the
    // safety net that lets a burst of gunfire + flak + engines stay clean.
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);

    // White-noise burst buffers (3 variants so repeated shots don't phase).
    for (let b = 0; b < 3; b++) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBufs.push(buf);
    }

    buildEngineBed();
    api.ready = true;
  }

  // --- Engine bed: four R-1820 radials in formation --------------------------
  // Layers: two detuned saws (the exhaust drone beats against itself like
  // unsynced props), looped brown noise (air + combustion wash), all through a
  // shared lowpass, with a slow amplitude wobble for the prop beat.
  // Steady-state nodes: osc1, osc2, noiseSrc, lpf, lfo, lfoDepth, wobble, bed = 8.
  function buildEngineBed() {
    // Brown noise loop (~3s), crossfaded at the seam so it loops silently.
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 2.2;
    }
    const F = 2048;
    for (let k = 0; k < F; k++) {
      const m = k / F;
      d[len - F + k] = d[len - F + k] * (1 - m) + d[k] * m;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;

    osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
    osc2 = ctx.createOscillator(); osc2.type = 'sawtooth';

    bedLpf = ctx.createBiquadFilter();
    bedLpf.type = 'lowpass'; bedLpf.Q.value = 0.6;

    // Prop beat: LFO wobbles the bed amplitude +-12% at 8-11Hz.
    const wobble = ctx.createGain(); wobble.gain.value = 1;
    lfo = ctx.createOscillator(); lfo.type = 'sine';
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.12;
    lfo.connect(lfoDepth).connect(wobble.gain);

    bed = ctx.createGain(); bed.gain.value = 0;   // silent until engineStart()

    osc1.connect(bedLpf); osc2.connect(bedLpf); noise.connect(bedLpf);
    bedLpf.connect(wobble).connect(bed).connect(master);

    const t = ctx.currentTime;
    osc1.start(t); osc2.start(t); noise.start(t); lfo.start(t);
    applyThrottle(throttle, 0.01);
  }

  function applyThrottle(t, tc) {
    const at = ctx.currentTime;
    osc1.frequency.setTargetAtTime(55 * t, at, tc);
    osc2.frequency.setTargetAtTime(57.5 * t, at, tc);
    bedLpf.frequency.setTargetAtTime(150 + 130 * t, at, tc);  // opens a touch at full power
    lfo.frequency.setTargetAtTime(6.5 + 3.2 * t, at, tc);     // prop beat quickens with RPM
  }

  // --- One-shot helpers -------------------------------------------------------
  // Fire-and-forget noise burst: source -> biquad -> gain envelope -> master.
  // `rate` retunes the noise, `freqEnd` sweeps the filter across the burst.
  function burst({ dur = 0.1, atk = 0.002, peak = 0.4, type = 'bandpass', freq = 900, q = 0.8, freqEnd = 0, rate = 1, at = 0 } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBufs[(Math.random() * noiseBufs.length) | 0];
    src.loop = true;                       // long booms outlast the short buffers
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // Fire-and-forget tonal thump: oscillator with the same fast-attack envelope.
  function thump({ f0 = 70, f1 = 0, dur = 0.09, atk = 0.003, peak = 0.3, type = 'sine', at = 0 } = {}) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // --- Public API -------------------------------------------------------------
  const api = {
    ready: false,
    init,
    get muted() { return muted; },

    setMuted(m) {
      muted = !!m;
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
    },

    setThrottle(t) {
      throttle = t;
      if (api.ready) applyThrottle(t, 0.25);   // slow retune — big radials don't snap
    },

    engineStart() {
      if (!api.ready) return;
      bed.gain.setTargetAtTime(BED_LEVEL, ctx.currentTime, 0.35);   // ~1s swell
    },

    engineStop() {
      if (!api.ready) return;
      bed.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    },

    // One .50-cal report: bandpassed crack + highpass click transient + 70Hz
    // thump. Rate is randomized +-8% so a 10Hz stream doesn't sound machine-made.
    shot() {
      if (!api.ready) return;
      const r = 0.92 + Math.random() * 0.16;
      burst({ dur: 0.06 + Math.random() * 0.03, atk: 0.002, peak: 0.5, type: 'bandpass', freq: 900, q: 0.8, rate: r });
      burst({ dur: 0.015, atk: 0.001, peak: 0.32, type: 'highpass', freq: 3000, rate: r });
      thump({ f0: 70, dur: 0.07, atk: 0.002, peak: 0.22 });
    },

    // Dry metallic click — bolt falling on an empty chamber.
    gunEmpty() {
      if (!api.ready) return;
      burst({ dur: 0.03, atk: 0.001, peak: 0.22, type: 'highpass', freq: 2500 });
      burst({ dur: 0.05, atk: 0.001, peak: 0.13, type: 'bandpass', freq: 1600, q: 9, at: 0.012 });
    },

    // Tiny bright tick for rounds sparking off a fighter.
    hitSpark() {
      if (!api.ready) return;
      burst({ dur: 0.035, atk: 0.001, peak: 0.18, type: 'bandpass', freq: 2400 + Math.random() * 800, q: 3, rate: 0.9 + Math.random() * 0.2 });
    },

    // Fighter kill. distance01: 0 = near (long, bright, loud), 1 = far (short,
    // dull, quiet). Sweeping lowpass gives the boom its bloom-then-rumble shape.
    explosion(distance01) {
      if (!api.ready) return;
      const d = Math.min(1, Math.max(0, distance01 || 0));
      const dur = 1.4 - 0.6 * d;
      burst({ dur, atk: 0.01, peak: 0.85 * (1 - 0.65 * d), type: 'lowpass', freq: 1200 - 850 * d, freqEnd: 150, q: 0.5, rate: 0.7 });
      thump({ f0: 45, dur: dur * 0.8, atk: 0.01, peak: 0.5 * (1 - 0.6 * d) });
    },

    // Flak crump: muffled at distance, a real gut-punch when close.
    flak(near) {
      if (!api.ready) return;
      if (near) {
        burst({ dur: 0.28 + Math.random() * 0.05, atk: 0.004, peak: 0.5, type: 'lowpass', freq: 700, q: 0.6, rate: 0.8 });
        thump({ f0: 55, dur: 0.25, atk: 0.005, peak: 0.35 });
      } else {
        burst({ dur: 0.15 + Math.random() * 0.08, atk: 0.006, peak: 0.2, type: 'lowpass', freq: 300, q: 0.6, rate: 0.75 });
      }
    },

    // Shackle clunk in the bay, then a quiet descending whistle (~2.5s total).
    bombAway() {
      if (!api.ready) return;
      thump({ f0: 90, f1: 45, dur: 0.12, peak: 0.4 });
      burst({ dur: 0.08, atk: 0.002, peak: 0.28, type: 'lowpass', freq: 260, q: 0.7 });
      const t = ctx.currentTime + 0.15;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(500, t + 2.2);
      const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.5;
      const vibG = ctx.createGain(); vibG.gain.value = 14;    // slight vibrato
      vib.connect(vibG).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.35);
      g.gain.setValueAtTime(0.06, t + 1.8);
      g.gain.linearRampToValueAtTime(0, t + 2.3);
      o.connect(g).connect(master);
      o.start(t); vib.start(t);
      o.stop(t + 2.35); vib.stop(t + 2.35);
    },

    // Deep rumble from five miles down.
    bombHit() {
      if (!api.ready) return;
      burst({ dur: 1.6, atk: 0.015, peak: 0.85, type: 'lowpass', freq: 500, freqEnd: 80, q: 0.4, rate: 0.6 });
      thump({ f0: 40, dur: 1.3, atk: 0.02, peak: 0.55 });
    },

    // Soft UI tick.
    uiClick() {
      if (!api.ready) return;
      burst({ dur: 0.025, atk: 0.001, peak: 0.09, type: 'bandpass', freq: 1300, q: 2 });
    },

    // Airframe taking a hit: low thump through the ribs + brief metallic rattle.
    damage() {
      if (!api.ready) return;
      thump({ f0: 65, f1: 40, dur: 0.18, peak: 0.45 });
      burst({ dur: 0.2, atk: 0.004, peak: 0.28, type: 'lowpass', freq: 500, q: 0.6, rate: 0.85 });
      for (let i = 0; i < 3; i++) {
        burst({ at: 0.05 + i * 0.05 + Math.random() * 0.02, dur: 0.03, atk: 0.001, peak: 0.12, type: 'bandpass', freq: 1700 + Math.random() * 600, q: 5 });
      }
    },
  };

  return api;
}
