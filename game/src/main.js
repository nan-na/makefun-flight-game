// Golden Hour — The Sunset Circuit: boot, fixed-step loop, screens and keys.
// No build step: index.html loads this module, which loads the rest.

import { AIRCRAFT_ORDER, BEST_KEY, FIELD, STEP, STARS_KEY } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { autopilot, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_HARD, EVENT_LEG, EVENT_OVER, EVENT_RING, EVENT_TOUCHDOWN, World } from './world.js';
import { render, SCREEN_CRASH, SCREEN_DEBRIEF, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shotName = params.get('shot');

const world = new World(seed);
const input = createInput(canvas);
const audio = createAudio();

const ui = {
  time: 0,
  selectedAircraft: 'falcon',
  stars: 0,
  best: 0,
  showMouseHint: true,
};

try { ui.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0; } catch { ui.best = 0; }
try { ui.stars = Number(localStorage.getItem(STARS_KEY) ?? 0) || 0; } catch { ui.stars = 0; }
world.best = ui.best;
world.starsEarned = ui.stars;

function saveProgress() {
  try {
    localStorage.setItem(BEST_KEY, String(Math.max(ui.best, world.best)));
    localStorage.setItem(STARS_KEY, String(Math.max(ui.stars, world.starsEarned)));
  } catch { /* private mode: the game still plays */ }
  ui.best = Math.max(ui.best, world.best);
  ui.stars = Math.max(ui.stars, world.starsEarned);
}

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

/** Clicking an aircraft card on the title screen selects it. */
function cardAt(x, y) {
  if (y < 290 || y > 420) return null;
  const cx = FIELD.width / 2;
  if (x >= cx - 330 && x < cx - 110) return 'sparrow';
  if (x >= cx - 110 && x < cx + 110) return 'falcon';
  if (x >= cx + 110 && x < cx + 330) return 'comet';
  return null;
}

function aircraftLocked(key) {
  if (key === 'falcon') return ui.stars < 1;
  if (key === 'comet') return ui.stars < 3;
  return false;
}

function selectAircraft(key) {
  if (aircraftLocked(key)) return;
  ui.selectedAircraft = key;
  audio.click();
}

function startFlight() {
  audio.unlock();
  audio.click();
  world.startFlight(ui.selectedAircraft);
  ui.showMouseHint = true;
  announce('Flying the ' + world.aircraft.name + ' — takeoff, rings, landing.');
}

let pausedFrom = null;

function handleKeys() {
  if (input.pressed('m')) {
    const muted = audio.toggleMute();
    announce(muted ? 'Sound off.' : 'Sound on.');
  }
  if (world.screen === SCREEN_TITLE) {
    if (input.pressed('1')) selectAircraft('sparrow');
    if (input.pressed('2')) selectAircraft('falcon');
    if (input.pressed('3')) selectAircraft('comet');
    if (input.pressed('enter') || input.pressed(' ')) startFlight();
    return;
  }
  if (world.screen === SCREEN_PLAY) {
    if (input.pressed('p')) {
      pausedFrom = SCREEN_PLAY;
      world.screen = SCREEN_PAUSE;
      announce('Paused.');
    }
    if (input.pressed('r')) startFlight();
    if (input.pressed('t')) { world.reset(); world.best = ui.best; world.starsEarned = ui.stars; }
    return;
  }
  if (world.screen === SCREEN_PAUSE) {
    if (input.pressed('p') || input.pressed('enter') || input.pressed(' ')) {
      world.screen = pausedFrom ?? SCREEN_PLAY;
      announce('Flying.');
    }
    if (input.pressed('r')) startFlight();
    if (input.pressed('t')) { world.reset(); world.best = ui.best; world.starsEarned = ui.stars; }
    return;
  }
  if (world.screen === SCREEN_DEBRIEF) {
    if (input.pressed('n')) { audio.click(); world.nextDay(); }
    if (input.pressed('r')) startFlight();
    if (input.pressed('t') || input.pressed('enter')) { world.reset(); world.best = ui.best; world.starsEarned = ui.stars; }
    return;
  }
  if (world.screen === SCREEN_CRASH) {
    if (input.pressed('r') || input.pressed('enter') || input.pressed(' ')) startFlight();
    if (input.pressed('t')) { world.reset(); world.best = ui.best; world.starsEarned = ui.stars; }
  }
}

canvas.addEventListener('click', (e) => {
  audio.unlock();
  if (world.screen === SCREEN_TITLE) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * FIELD.width;
    const y = ((e.clientY - rect.top) / rect.height) * FIELD.height;
    const card = cardAt(x, y);
    if (card) { selectAircraft(card); return; }
    startFlight();
  } else if (world.screen === SCREEN_PAUSE) {
    world.screen = pausedFrom ?? SCREEN_PLAY;
  }
});

function handleEvents(events) {
  if (events & EVENT_RING) audio.ring(world.combo);
  if (events & EVENT_TOUCHDOWN) audio.touchdown();
  if (events & EVENT_HARD) audio.hard();
  if (events & EVENT_CRASH) audio.crash();
  if (events & EVENT_LEG) audio.leg();
  if (events & EVENT_FUEL_EMPTY) audio.click();
  if (events & EVENT_OVER) {
    saveProgress();
    if (world.screen === SCREEN_DEBRIEF) audio.fanfare(world.debrief.stars);
  }
}

// --- screenshot staging: ?shot=start|play|rush|end&seed=7 ---
if (shotName) {
  const staged = stageShot(shotName, world);
  world.best = staged.best;
  ui.best = Math.max(ui.best, staged.best);
  ui.selectedAircraft = 'falcon';
  ui.showMouseHint = false;
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(FIELD.width * dpr);
  canvas.height = Math.round(FIELD.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

let last = performance.now();
let acc = 0;
let shotReady = false;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  ui.time += dt;
  handleKeys();
  input.afterFrame();
  if (world.screen === SCREEN_PLAY) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      const events = world.step(STEP, input.stick());
      handleEvents(events);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
    audio.update(world.plane.throttle, world.plane.speed, world.stalled, ui.time);
  } else if (world.screen === SCREEN_TITLE) {
    // The parked plane idles: propeller barely turning, clouds drifting.
    audio.update(0, 0, false, ui.time);
  }
  render(ctx, world, ui);
  if (shotName && !shotReady) {
    shotReady = true;
    window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For automated playtests and the screenshot driver only.
window.__flight = { world, input, autopilot, ui, startFlight, selectAircraft };
window.__shotReady = false;
