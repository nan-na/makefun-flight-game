// The screenshot scenes behind ?shot=start|play|rush|end. Each one plays the real
// rules forward from a fresh world, steered by the autopilot in world.js, so the
// frame is what a real flight looks like and the same seed always gives the same
// frame. The cover ("rush") catches the plane banking hard toward the next
// golden ring with the valley and the sunset behind it.

import { SCREEN_CRASH, SCREEN_DEBRIEF, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { autopilot } from './world.js';
import { LEGS, STEP } from './config.js';

const START_SECONDS = 2;
const LIMIT_SECONDS = 600;

/** Run the autopilot until `stop` is true, or the limit, and return the events. */
function runUntil(world, stop) {
  let events = 0;
  for (let i = 0; i < LIMIT_SECONDS / STEP; i += 1) {
    events = world.step(STEP, autopilot(world));
    if (stop(world)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: title over the parked plane. play: just after rotation, low over the
 * strip. rush: banking toward the next ring mid-course (the cover). end: the
 * debrief after a full flown circuit.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    world.startFlight('falcon');
    runUntil(world, (w) => !w.plane.onGround && w.plane.y > 22 && w.plane.speed > 42);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'rush') {
    world.startFlight('falcon');
    runUntil(world, (w) => w.ringsHit >= 2 && w.leg === LEGS.RINGS);
    // A few more steps, so the frame catches the bank into the next ring.
    for (let i = 0; i < 45; i += 1) world.step(STEP, autopilot(world));
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    world.startFlight('falcon');
    runUntil(world, (w) => w.screen === SCREEN_DEBRIEF || w.screen === SCREEN_CRASH);
    if (world.screen === SCREEN_DEBRIEF) return { screen: SCREEN_DEBRIEF, best: world.best };
    return { screen: SCREEN_CRASH, best: 0 };
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
