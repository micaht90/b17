# B-17: Flying Fortress

A small browser game inspired by the old Macintosh B-17 bombing games. Fly a
single bombing mission: man the Fortress's gun stations to fend off fighters,
survive the flak, make a weight-management decision to stay aloft, then pick
your target out of the bombsight and drop.

**Phone-first** — designed to be played on a phone held in **landscape**, with
touch controls. Also works on desktop with mouse + keyboard.

## How to play

1. **Briefing** — study the target illustration. You'll need to recognize it
   later from the air.
2. **Cruise / combat** — fighters attack from different directions. Each gun
   **station** (nose, top, ball, tail, left/right waist) covers one arc. Tap a
   station on the plane diagram (or press its number key) to man it, aim, and
   fire. The diagram flashes red where fighters are attacking — switch there.
   Any fighter you don't drive off damages the Fortress.
3. **The decision** — the loaded plane sags below the flak belt. Choose:
   **dump fuel** (climb back, thin reserve), **jettison ammo** (climb back,
   almost no ammo left), or **press on** (keep everything, cross the flak low
   and take double damage).
4. **Bomb run** — a top-down bombsight. Buildings scroll past; recognize the
   one that matches the briefing and tap **Drop** as it crosses the ring.
5. **Results** — score from the bomb hit + accuracy, fighters downed, hull
   remaining, and fuel reserve. Tap **Fly Again** to re-fly.

### Controls

| Action | Touch | Desktop |
|---|---|---|
| Aim | drag in the view | move mouse |
| Fire | hold the **FIRE** button | hold click / **Space** |
| Switch station | tap the plane diagram | keys **1**–**6** |
| Menu / decision / drop | tap the button | click the button |

## Run it locally

ES modules must be served over HTTP (not opened as a `file://` path):

```bash
cd b17
python3 -m http.server 8000
# then open http://localhost:8000
```

To try it on a phone, open the same machine's LAN address (e.g.
`http://<your-computer-ip>:8000`) in the phone's browser, held in landscape.

## Tech

Pure vanilla HTML + CSS + JavaScript with an HTML5 Canvas. No framework, no
build step, no dependencies. All paths are relative and a `.nojekyll` file is
included, so it deploys as-is to GitHub Pages. Because it's a self-contained
static web app, the same files can later be wrapped as a desktop (e.g. Mac) app
with Tauri or Electron without code changes.

### Project layout

```
index.html            canvas + module entry
css/style.css         full-bleed layout, no-scroll touch
js/
  main.js             wires viewport + input + state, runs the loop
  config.js           tunable gameplay constants
  loop.js             rAF loop with clamped dt
  state.js            the single game-state object + reset
  phases.js           briefing -> cruise -> decision -> bomb run -> results
  input.js            touch-first + mouse/keyboard input
  viewport.js         responsive canvas (devicePixelRatio) + portrait detect
  ui.js               per-phase button layout + hit testing
  stations.js         the six gun stations and their attack arcs
  enemies.js          fighter waves, AI, screen projection
  combat.js           aiming, firing, hit detection
  flak.js             anti-aircraft fire in the target zone
  resources.js        fuel/weight model + the decision levers
  bombing.js          bomb-run logic + drop scoring
  targets.js          programmatic building silhouettes
  scoring.js          score + localStorage best
  data/missions.js    mission definitions (campaign-ready)
  render/             world / hud / screens canvas rendering
```

The mission data shape supports adding a multi-mission campaign later.
