# Golden Hour — The Sunset Circuit

A pseudo-3D flight game for the make.fun best-flight-game bounty. You fly a
small prop plane out of a valley airfield at sunset: take off from runway 27,
thread six golden rings over patchwork fields, a river and a little city, then
bring her home for a precision landing — on finite fuel, in a growing
crosswind, with a stall waiting if you fly too slow.

## Why it is different

- **Real flight feel, arcade-tuned**: throttle, pitch and banked turns, lift
  that quits below stall speed (the nose drops and she sinks), a crosswind you
  have to crab into, and fuel that burns with the throttle — a sortie is a
  set of decisions, not a rail ride.
- **Three aircraft to unlock**: the gentle Sparrow trainer, the balanced
  Falcon, and the fast, thirsty Comet (3 stars to unlock).
- **A living golden-hour valley**: low sun, drifting clouds, patchwork
  fields, a river, a city with lit windows, a mountain ridge on the horizon,
  and a windsock that shows the wind you are fighting.
- **Missions with different goals**: a takeoff, a ring course with combo
  bonuses, and a scored precision landing (centreline, sink rate, speed,
  touchdown zone), then a harder day with tighter rings and stronger wind.
- **Full cockpit HUD**: airspeed, altitude, vertical speed, compass strip,
  heading, throttle, fuel, airframe damage, wind, and a live mission banner.

## How to play

- **Arrows** fly (up/down pitch, left/right bank). **W/S** or the **mouse
  wheel** is the throttle. **Mouse** steers too (move to bank and pitch).
  **Space** or holding the mouse button is the brake.
- **1/2/3** pick the aircraft on the title screen; **Enter** or click to fly.
- **P** pauses, **M** mutes, **R** restarts the flight, **N** starts the next
  (harder) day after a landing, **T** goes back to the title.
- Take off: full throttle, rotate at the speed on the banner, climb past 50 m.
- Rings: fly through the centre of each golden ring — the next one glows and
  the HUD shows its distance. Fast consecutive rings build a combo.
- Landing: come home on runway 27, keep the sink gentle (under 2 m/s is a
  soft touchdown), stay on the centreline, and stop in the touchdown zone.
- Watch the fuel gauge and the stall warning: below stall speed she sinks,
  and an empty tank means gliding home.

## Run it

Serve `game/` with any static server and open `game/index.html` in a desktop
browser (Chrome works). No build step, no network requests, no libraries —
the game is plain HTML, canvas art and ES modules, with synthesized Web Audio
sound effects (engine hum, wind, ring chimes, touchdown thud). Keyboard and
mouse.

## Layout

- `main.ts` — the hand-in program (Node 22): copies `game/` and `screenshots/`
  to `/output` and writes `dossier.json`.
- `game/index.html` + `game/src/`: config.js (tuning, aircraft, palette),
  random.js (seeded RNG), world.js (flight model, missions, rings, terrain,
  autopilot), input.js (keyboard + mouse), audio.js (synth SFX), render.js
  (pseudo-3D chase view, HUD, screens), shots.js (`?shot=` staging),
  main.js (boot + fixed-step loop).
- `screenshots/` — 4 JPEGs of the game itself (cover: banking toward the
  next ring at golden hour), mapped in `shots.json` (seed 7).
