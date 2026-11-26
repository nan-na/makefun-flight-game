// Golden Hour — The Sunset Circuit: every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. All speeds are m/s, all
// distances metres, all angles degrees unless a name says radians.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Gravity, m/s^2, used for the climb/descent energy balance. */
export const G = 9.81;

/** The runway: a strip along +z, centred on x = 0. */
export const RUNWAY = { x: 0, z0: 0, z1: 600, halfWidth: 12, heading: 0 };

/** Three aircraft to unlock: the trainer is forgiving, the racer is fast and twitchy. */
export const AIRCRAFT = {
  sparrow: {
    name: 'Sparrow',
    blurb: 'Trainer — gentle, forgiving, sips fuel',
    thrust: 24, drag: 0.0034, stall: 24, rotate: 31,
    maxBank: 50, maxPitchUp: 20, maxPitchDown: 12,
    turn: 0.46, climb: 1.0, fuelBurn: 0.85, colour: '#f4ead8', accent: '#2e7d6b',
  },
  falcon: {
    name: 'Falcon',
    blurb: 'All-rounder — the sunset circuit standard',
    thrust: 27, drag: 0.0032, stall: 28, rotate: 35,
    maxBank: 55, maxPitchUp: 22, maxPitchDown: 14,
    turn: 0.5, climb: 1.0, fuelBurn: 1.0, colour: '#f6e7c9', accent: '#c23b2e',
  },
  comet: {
    name: 'Comet',
    blurb: 'Racer — fast, thirsty, stalls if you blink',
    thrust: 33, drag: 0.0029, stall: 33, rotate: 40,
    maxBank: 62, maxPitchUp: 24, maxPitchDown: 16,
    turn: 0.56, climb: 1.05, fuelBurn: 1.35, colour: '#ffe9a8', accent: '#7a3fd1',
  },
};

/** Flight order: Sparrow first, Falcon unlocked with 1 star, Comet with 3 stars. */
export const AIRCRAFT_ORDER = ['sparrow', 'falcon', 'comet'];
export const AIRCRAFT_UNLOCK_STARS = { sparrow: 0, falcon: 1, comet: 3 };

/** A flight is three legs: takeoff, a ring course, a precision landing. */
export const LEGS = { TAKEOFF: 'takeoff', RINGS: 'rings', LANDING: 'landing', DONE: 'done' };

export const RINGS_PER_FLIGHT = 6;
export const RING = { radiusDay1: 18, radiusStep: -1.5, minRadius: 10 };

/** Wind grows with the day: a crosswind from the west that pushes the nose off line. */
export const WIND = { baseSpeed: 0, perDay: 3.5, direction: -1 };

/** Fuel: 100 units a flight; burn scales with throttle and aircraft thirst. */
export const FUEL = { max: 100, baseBurn: 0.09, throttleBurn: 0.42, reserveWarn: 22 };

/** Damage: a hard landing costs one point; three and the airframe is written off. */
export const DAMAGE_MAX = 3;

/** Landing quality windows. */
export const LANDING = {
  zoneZ0: 120, zoneZ1: 320,
  softSink: 2.0, okSink: 3.5, hardSink: 6.0,
  centreGreat: 4, centreOk: 10,
  speedGreat: 45, speedOk: 55,
  centrePoints: 200, sinkPoints: 200, speedPoints: 100,
};

/** Scoring. */
export const SCORE = {
  ring: 100, ringComboStep: 15, ringComboWindow: 20,
  star2: 800, star3: 1100, parTime: 240,
};

/** The world the plane flies over (seeded, same every run for a given seed). */
export const WORLD = {
  riverX0: 320, riverX1: 400,
  cityX0: -520, cityX1: -140, cityZ0: 80, cityZ1: 520,
  mountainZ: 5200, mountainHeight: 320,
  treeCount: 130, buildingCount: 42, cloudCount: 14,
};

/** Golden-hour palette. */
export const PALETTE = {
  skyTop: '#2a1c4e', skyMid: '#7a2d52', skyLow: '#e2602e', horizon: '#ffb347',
  sunCore: '#fff3c4', sunGlow: '#ff9a3c',
  fieldA: '#c9a227', fieldB: '#7d9b3f', fieldC: '#a8763e', fieldD: '#5d7a35', fieldE: '#d9b64a',
  water: '#3f6d8e', waterDeep: '#2c4f6e',
  city: '#5c5a66', cityRoof: '#7a4a3a',
  asphalt: '#3d3a40', runwayMark: '#f2ead8',
  mountain: '#6b4a5e', mountainSnow: '#e8d9c8',
  cloud: '#ffd9a8',
  plane: '#f6e7c9', planeAccent: '#c23b2e',
  ringNext: '#ffc93c', ringOther: '#9fd8ff', ringDone: '#7be495',
  hud: '#fff6e0', hudDim: '#ffd9a8', hudWarn: '#ff5a4e', hudGood: '#7be495',
  panel: 'rgba(24, 12, 40, 0.72)', panelEdge: 'rgba(255, 201, 60, 0.55)',
  text: '#fff6e0', muted: '#e8c9a0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score and earned stars are kept between visits (this browser only). */
export const BEST_KEY = 'golden-hour-flight.best';
export const STARS_KEY = 'golden-hour-flight.stars';
