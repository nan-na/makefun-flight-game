// Golden Hour — the world: flight model, missions, rings, terrain and autopilot.
// Pure simulation, no DOM: the same code runs in the browser and in Node tests.
// Angles: heading is radians from +z (north), 0 = runway heading; pitch and bank
// are radians, positive pitch = nose up, positive bank = right wing down.

import {
  AIRCRAFT, DAMAGE_MAX, FIELD, FUEL, G, LANDING, LEGS, RING, RINGS_PER_FLIGHT,
  RUNWAY, SCORE, STEP, WIND, WORLD,
} from './config.js';
import { hash2, mulberry32 } from './random.js';

/** Event bits a step can return (main.js turns them into sound and banners). */
export const EVENT_NONE = 0;
export const EVENT_RING = 1 << 0;
export const EVENT_TOUCHDOWN = 1 << 1;
export const EVENT_CRASH = 1 << 2;
export const EVENT_LEG = 1 << 3;
export const EVENT_STALL = 1 << 4;
export const EVENT_FUEL_EMPTY = 1 << 5;
export const EVENT_HARD = 1 << 6;
export const EVENT_OVER = 1 << 7;
export const EVENT_BOUNCE = 1 << 8;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_DEBRIEF = 'debrief';
export const SCREEN_CRASH = 'crash';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
/** Shortest signed angle difference, in (-PI, PI]. */
function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Terrain height at (x, z): flat airfield and fields, a ridge far to the north. */
export function terrainHeight(x, z) {
  if (z < WORLD.mountainZ) return 0;
  const t = clamp((z - WORLD.mountainZ) / 900, 0, 1);
  const ridge = Math.sin(x * 0.0016 + 1.7) * 0.5 + 0.5;
  return t * t * WORLD.mountainHeight * (0.35 + 0.65 * ridge);
}

/** What the ground looks like at (x, z): a patchwork of golden fields, a river,
 *  a small city beside the airfield, asphalt on the runway, rock on the ridge. */
export function groundKind(x, z) {
  if (Math.abs(x - RUNWAY.x) < RUNWAY.halfWidth + 2 && z > RUNWAY.z0 - 20 && z < RUNWAY.z1 + 20) return 'runway';
  if (z >= WORLD.mountainZ) return 'mountain';
  if (x > WORLD.riverX0 && x < WORLD.riverX1 && z > -600) return 'water';
  if (x > WORLD.cityX0 && x < WORLD.cityX1 && z > WORLD.cityZ0 && z < WORLD.cityZ1) return 'city';
  const h = hash2(Math.floor(x / 64), Math.floor(z / 64), 11);
  if (h < 0.22) return 'fieldA';
  if (h < 0.44) return 'fieldB';
  if (h < 0.62) return 'fieldC';
  if (h < 0.82) return 'fieldD';
  return 'fieldE';
}

/** Build the ring course for a day: a weaving line out to the ridge and back. */
export function buildRings(day, seed) {
  const rng = mulberry32(seed * 7919 + day * 131);
  const radius = Math.max(RING.minRadius, RING.radiusDay1 + (day - 1) * RING.radiusStep);
  const rings = [];
  const legs = [
    { x: -260, z: 900, y: 80 }, { x: 300, z: 1300, y: 120 }, { x: -180, z: 1750, y: 95 },
    { x: 240, z: 2150, y: 140 }, { x: -80, z: 2450, y: 110 }, { x: 120, z: 1950, y: 95 },
  ];
  for (let i = 0; i < RINGS_PER_FLIGHT; i += 1) {
    const base = legs[i];
    rings.push({
      x: base.x + (rng() - 0.5) * 60,
      y: base.y + (rng() - 0.5) * 30,
      z: base.z + (rng() - 0.5) * 60,
      r: radius, passed: false, index: i,
    });
  }
  return rings;
}

/** Scattered trees and city buildings, seeded once per world. */
export function buildScenery(seed) {
  const rng = mulberry32(seed * 104729 + 7);
  const trees = [];
  for (let i = 0; i < WORLD.treeCount; i += 1) {
    const x = (rng() - 0.5) * 2400;
    const z = rng() * 2800 - 200;
    if (groundKind(x, z) !== 'fieldA' && groundKind(x, z) !== 'fieldB'
      && groundKind(x, z) !== 'fieldD' && groundKind(x, z) !== 'fieldE') continue;
    trees.push({ x, z, h: 9 + rng() * 9, w: 5 + rng() * 4 });
  }
  const buildings = [];
  for (let i = 0; i < WORLD.buildingCount; i += 1) {
    const x = WORLD.cityX0 + 20 + rng() * (WORLD.cityX1 - WORLD.cityX0 - 40);
    const z = WORLD.cityZ0 + 20 + rng() * (WORLD.cityZ1 - WORLD.cityZ0 - 40);
    buildings.push({ x, z, h: 18 + rng() * 55, w: 16 + rng() * 22, d: 16 + rng() * 22 });
  }
  const clouds = [];
  for (let i = 0; i < WORLD.cloudCount; i += 1) {
    clouds.push({
      x: (rng() - 0.5) * 4200, y: 170 + rng() * 110, z: rng() * 3200 - 300,
      s: 60 + rng() * 110, drift: 1.5 + rng() * 2,
    });
  }
  return { trees, buildings, clouds };
}

export class World {
  constructor(seed = 7) {
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.aircraftKey = 'falcon';
    this.day = 1;
    this.screen = SCREEN_TITLE;
    this.leg = LEGS.TAKEOFF;
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.ringsHit = 0;
    this.damage = 0;
    this.fuel = FUEL.max;
    this.fuelEmpty = false;
    this.stalled = false;
    this.stallTime = 0;
    this.message = '';
    this.messageTimer = 0;
    this.crashReason = '';
    this.landing = null;
    this.debrief = null;
    this.best = 0;
    this.starsEarned = 0;
    this.wind = { speed: WIND.baseSpeed, x: 0 };
    this.scenery = buildScenery(this.seed);
    this.rings = buildRings(this.day, this.seed);
    this.plane = this.freshPlane();
    this.events = EVENT_NONE;
  }

  freshPlane() {
    return {
      x: RUNWAY.x, y: 0, z: 40,
      heading: 0, pitch: 0, bank: 0,
      speed: 0, throttle: 0, onGround: true,
      verticalSpeed: 0, gearDown: true,
    };
  }

  get aircraft() { return AIRCRAFT[this.aircraftKey]; }
  get nextRing() { return this.rings.find((r) => !r.passed) ?? null; }
  get windSpeed() { return WIND.baseSpeed + (this.day - 1) * WIND.perDay; }

  /** Start a flight with the chosen aircraft (day keeps its difficulty). */
  startFlight(aircraftKey) {
    this.aircraftKey = aircraftKey;
    this.leg = LEGS.TAKEOFF;
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.ringsHit = 0;
    this.damage = 0;
    this.fuel = FUEL.max;
    this.fuelEmpty = false;
    this.stalled = false;
    this.stallTime = 0;
    this.landing = null;
    this.debrief = null;
    this.crashReason = '';
    this.wind = { speed: this.windSpeed, x: -this.windSpeed };
    this.rings = buildRings(this.day, this.seed);
    this.plane = this.freshPlane();
    this.screen = SCREEN_PLAY;
    this.setMessage('TAKEOFF — throttle up, rotate at ' + this.aircraft.rotate + ' m/s');
  }

  setMessage(text, seconds = 3.5) {
    this.message = text;
    this.messageTimer = seconds;
  }

  /** One fixed step. `input` is { pitch, roll, throttle, brake } in [-1, 1].
   *  Returns the event bits for this step. */
  step(dt, input) {
    this.events = EVENT_NONE;
    if (this.screen !== SCREEN_PLAY) return this.events;
    const p = this.plane;
    const ac = this.aircraft;
    this.time += dt;
    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // --- throttle and fuel ---
    const wasEmpty = this.fuelEmpty;
    if (!this.fuelEmpty) {
      p.throttle = clamp(p.throttle + input.throttle * dt * 1.4, 0, 1);
      this.fuel -= (FUEL.baseBurn + FUEL.throttleBurn * p.throttle) * ac.fuelBurn * dt;
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.fuelEmpty = true;
        p.throttle = 0;
        this.events |= EVENT_FUEL_EMPTY;
        this.setMessage('FUEL EMPTY — glide her home', 4);
      }
    } else if (!wasEmpty) {
      this.events |= EVENT_FUEL_EMPTY;
    }
    const braking = input.brake > 0.5;

    // --- controls: targets ease toward the stick, mushy when stalled ---
    const control = this.stalled ? 0.45 : 1;
    const targetBank = input.roll * ac.maxBank * Math.PI / 180 * control;
    const targetPitch = input.pitch * (input.pitch > 0 ? ac.maxPitchUp : ac.maxPitchDown) * Math.PI / 180 * control;
    const ease = 1 - Math.exp(-dt * 3.2);
    p.bank += (targetBank - p.bank) * ease;
    if (p.onGround) {
      // Rotation: once she is near rotate speed the stick can lift the nose.
      if (p.speed > ac.rotate - 6) p.pitch += (targetPitch - p.pitch) * ease;
      else p.pitch += (0 - p.pitch) * ease;
    } else {
      p.pitch += (targetPitch - p.pitch) * ease;
    }

    // --- speed: thrust minus drag minus the climb's gravity bill ---
    const thrust = this.fuelEmpty ? 0 : ac.thrust * p.throttle;
    const drag = ac.drag * p.speed * p.speed + (braking && p.onGround ? 14 : 0);
    let accel = thrust - drag - G * Math.sin(p.pitch);
    // On the ground the brakes must be allowed to slow her: no floor at zero.
    if (p.onGround) accel = thrust - drag * 0.4;
    p.speed = Math.max(0, p.speed + accel * dt);

    // --- turn: a banked turn, weaker when slow (right wing down turns right) ---
    const turnAuthority = clamp(p.speed / 45, 0.15, 1);
    p.heading += p.bank * ac.turn * turnAuthority * dt * (p.onGround ? 0.25 : 1);

    // --- vertical: velocity follows pitch; below stall speed she sinks ---
    const wasStalled = this.stalled;
    this.stalled = !p.onGround && p.speed < ac.stall;
    if (this.stalled && !wasStalled) {
      this.events |= EVENT_STALL;
      this.setMessage('STALL — nose down, throttle up!', 2.5);
    }
    if (this.stalled) this.stallTime += dt;
    let vy = p.speed * Math.sin(p.pitch) * ac.climb;
    if (this.stalled) vy -= (ac.stall - p.speed) * 0.9;
    if (p.onGround) vy = 0;
    p.verticalSpeed = vy;

    // --- move, with the crosswind pushing sideways ---
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    p.x += (fx * p.speed * Math.cos(p.pitch) + this.wind.x * (p.onGround ? 0.1 : 1)) * dt;
    p.z += fz * p.speed * Math.cos(p.pitch) * dt;
    p.y += vy * dt;

    // --- lift-off ---
    if (p.onGround && p.speed > ac.rotate && p.pitch > 0.03) {
      p.onGround = false;
      p.y = Math.max(p.y, 0.5);
    }
    if (p.onGround) p.y = 0;

    // --- legs ---
    if (this.leg === LEGS.TAKEOFF && !p.onGround && p.y > 50) {
      this.leg = LEGS.RINGS;
      this.events |= EVENT_LEG;
      this.setMessage('RING COURSE — fly through all ' + RINGS_PER_FLIGHT + ' golden rings');
    }
    if (this.leg === LEGS.RINGS) {
      const ring = this.nextRing;
      if (ring) {
        const dx = p.x - ring.x, dy = p.y - ring.y, dz = p.z - ring.z;
        if (dx * dx + dy * dy + dz * dz < ring.r * ring.r * 0.81) {
          ring.passed = true;
          this.ringsHit += 1;
          this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
          this.comboTimer = SCORE.ringComboWindow;
          const pts = SCORE.ring + (this.combo - 1) * SCORE.ringComboStep;
          this.score += pts;
          this.events |= EVENT_RING;
          this.setMessage(this.combo > 1
            ? 'RING ' + this.ringsHit + '/' + RINGS_PER_FLIGHT + ' — combo x' + this.combo + '  +' + pts
            : 'RING ' + this.ringsHit + '/' + RINGS_PER_FLIGHT + '  +' + pts, 2);
          if (!this.nextRing) {
            this.leg = LEGS.LANDING;
            this.events |= EVENT_LEG;
            this.setMessage('ALL RINGS — bring her home, runway 27', 4);
          }
        }
      }
    }

    // --- ground: landing, hard landing, or crash ---
    const ground = terrainHeight(p.x, p.z);
    if (!p.onGround && p.y <= ground) {
      const onRunway = Math.abs(p.x - RUNWAY.x) < RUNWAY.halfWidth
        && p.z > RUNWAY.z0 && p.z < RUNWAY.z1;
      const sink = -vy;
      // Either runway direction counts: the strip is landed southbound.
      const aligned = Math.abs(angleDiff(p.heading, RUNWAY.heading)) < 0.26
        || Math.abs(angleDiff(p.heading, RUNWAY.heading + Math.PI)) < 0.26;
      const gentleBank = Math.abs(p.bank) < 0.21;
      if (onRunway && sink <= LANDING.okSink && p.speed <= LANDING.speedOk + 12 && aligned && gentleBank) {
        if (sink > LANDING.softSink || p.speed > LANDING.speedOk) {
          this.damage += 1;
          this.events |= EVENT_HARD;
          p.y = ground + 0.4;
          p.verticalSpeed = 1.6;
          p.pitch = 0.05;
          this.setMessage('HARD LANDING — airframe damage ' + this.damage + '/' + DAMAGE_MAX, 3);
          if (this.damage >= DAMAGE_MAX) return this.crash('airframe damaged beyond repair');
        } else {
          return this.touchdown(sink);
        }
      } else if (onRunway && sink <= LANDING.hardSink && p.speed < 70) {
        // A rough bounce on the strip: she lives, but it costs a damage point.
        this.damage += 1;
        this.events |= EVENT_HARD | EVENT_BOUNCE;
        p.y = ground + 0.6;
        p.verticalSpeed = 2.2;
        p.pitch = 0.06;
        p.speed *= 0.82;
        this.setMessage('BOUNCED — damage ' + this.damage + '/' + DAMAGE_MAX, 3);
        if (this.damage >= DAMAGE_MAX) return this.crash('airframe damaged beyond repair');
      } else {
        return this.crash(onRunway ? 'crashed on the runway' : 'crashed into the ground');
      }
    }
    if (p.onGround && this.leg === LEGS.DONE && p.speed < 8 && this.landing) {
      // Rolling out after a touchdown: the flight is over once she stops.
      return this.finishFlight();
    }
    if (p.y > 900) { p.y = 900; p.pitch = Math.min(p.pitch, 0); }
    if (Math.abs(p.x) > 3200 || p.z < -1200 || p.z > 4200) {
      return this.crash('flew out of the valley');
    }
    return this.events;
  }

  /** A good touchdown on the strip: score it and roll out. */
  touchdown(sink) {
    const p = this.plane;
    const centreErr = Math.abs(p.x - RUNWAY.x);
    const centrePts = centreErr <= LANDING.centreGreat ? LANDING.centrePoints
      : centreErr <= LANDING.centreOk ? 120 : 60;
    const sinkPts = sink <= LANDING.softSink ? LANDING.sinkPoints
      : sink <= LANDING.okSink ? 120 : 40;
    const speedPts = p.speed <= LANDING.speedGreat ? LANDING.speedPoints
      : p.speed <= LANDING.speedOk ? 50 : 20;
    const inZone = p.z >= LANDING.zoneZ0 && p.z <= LANDING.zoneZ1;
    const zonePts = inZone ? 100 : 0;
    const timeBonus = Math.max(0, Math.round((SCORE.parTime - this.time) * 0.5));
    this.landing = { centreErr, sink, speed: p.speed, inZone, centrePts, sinkPts, speedPts, zonePts, timeBonus };
    this.score += centrePts + sinkPts + speedPts + zonePts + timeBonus;
    p.onGround = true;
    p.y = 0;
    p.pitch = 0;
    p.bank *= 0.3;
    this.leg = LEGS.DONE;
    this.events |= EVENT_TOUCHDOWN;
    this.setMessage('TOUCHDOWN — rolling out', 3);
    return this.events;
  }

  crash(reason) {
    this.crashReason = reason;
    this.screen = SCREEN_CRASH;
    this.events |= EVENT_CRASH | EVENT_OVER;
    return this.events;
  }

  finishFlight() {
    const stars = this.score >= SCORE.star3 ? 3 : this.score >= SCORE.star2 ? 2 : 1;
    this.debrief = {
      score: this.score,
      stars,
      rings: this.ringsHit,
      landing: this.landing,
      time: this.time,
      fuelLeft: Math.round(this.fuel),
      damage: this.damage,
      day: this.day,
    };
    this.starsEarned = Math.max(this.starsEarned, stars);
    this.best = Math.max(this.best, this.score);
    this.screen = SCREEN_DEBRIEF;
    this.events |= EVENT_OVER;
    return this.events;
  }

  /** Next flight: a harder day (tighter rings, stronger wind). */
  nextDay() {
    this.day += 1;
    this.startFlight(this.aircraftKey);
  }
}

/**
 * Autopilot: a guidance law that flies the whole circuit — takeoff, rings,
 * landing — used by the screenshot staging, the logic sim and the playtest.
 * Returns the { pitch, roll, throttle, brake } input for this step.
 */
export function autopilot(world) {
  const p = world.plane;
  const ac = world.aircraft;
  const input = { pitch: 0, roll: 0, throttle: 0, brake: 0 };
  const clamp01 = (v) => clamp(v, -1, 1);

  /** Steer toward a point: bank to the heading error, pitch to the altitude error. */
  function steerTo(tx, ty, tz, speedTarget) {
    const dx = tx - p.x, dz = tz - p.z;
    const wantHeading = Math.atan2(dx, dz);
    const herr = angleDiff(wantHeading, p.heading);
    // Crab into the crosswind so the ground track, not just the nose, points there:
    // the nose must sit east of the track by the drift angle (target = track - crab).
    const crab = clamp(Math.asin(clamp(-world.wind.x / Math.max(30, p.speed), -0.5, 0.5)), -0.4, 0.4);
    input.roll = clamp01((herr - crab) * 2.2);
    const dist = Math.hypot(dx, dz);
    const wantAlt = ty;
    const altErr = wantAlt - p.y;
    const wantPitch = clamp(Math.atan2(altErr, Math.max(40, dist)) * 1.4, -0.16, 0.3);
    // Direct fraction of the pitch range: the step's own easing smooths it.
    const pitchRange = (wantPitch > 0 ? world.aircraft.maxPitchUp : world.aircraft.maxPitchDown) * Math.PI / 180;
    input.pitch = clamp01(wantPitch / pitchRange);
    // Slow down as the target nears, so the turn shrinks to the target's size.
    const nearSpeed = 34 + dist * 0.07;
    const minSpeed = world.aircraft.stall + 7;
    const speedGoal = clamp(Math.min(speedTarget, nearSpeed), minSpeed, 70);
    const speedErr = speedGoal - p.speed;
    input.throttle = clamp01(speedErr * 0.06);
    return dist;
  }

  if (world.leg === LEGS.TAKEOFF) {
    input.throttle = 1;
    if (p.speed > ac.rotate + 2) input.pitch = 0.55;
    if (p.y > 30) input.pitch = 0.25;
    return input;
  }
  if (world.leg === LEGS.RINGS) {
    const ring = world.nextRing;
    if (!ring) return input;
    steerTo(ring.x, ring.y, ring.z, 56);
    return input;
  }
  if (world.leg === LEGS.LANDING) {
    // Downwind fix, then track the 3-degree glidepath all the way to the strip:
    // aim laterally at the touchdown point, and hold the path's own sink rate
    // plus a correction for height error (aiming at the point alone is too weak).
    const z = p.z;
    if (z > 2400 || Math.abs(p.x) > 260) {
      steerTo(0, 110, 2500, 58);
    } else {
      // Final: hold the runway heading with a proportional correction for the
      // lateral offset (aiming at the touchdown point itself flips the nose
      // around the moment the plane flies past it), and track the glidepath.
      const wantHeading = Math.PI + Math.atan2(p.x, 250);
      const herr = angleDiff(wantHeading, p.heading);
      const crab = clamp(Math.asin(clamp(-world.wind.x / Math.max(30, p.speed), -0.5, 0.5)), -0.4, 0.4);
      input.roll = clamp01((herr - crab) * 2.2);
      const glideAlt = Math.max(0, (z - 220) * 0.052);
      let vyDes = clamp(-p.speed * 0.052 - 0.3 * (p.y - glideAlt), -8, 2);
      // Low and slow over the numbers: cap the sink so the touchdown is soft.
      if (p.y < 15) vyDes = clamp(vyDes, -1.9, 2);
      const wantPitch = Math.asin(clamp(vyDes / Math.max(20, p.speed), -0.3, 0.3));
      const pitchRange = (wantPitch > 0 ? world.aircraft.maxPitchUp : world.aircraft.maxPitchDown) * Math.PI / 180;
      input.pitch = clamp01(wantPitch / pitchRange);
      // Hold 40 m/s all the way to the strip: cutting power low only stalls her.
      input.throttle = clamp01((40 - p.speed) * 0.06);
    }
    return input;
  }
  // Rolling out after touchdown.
  input.brake = 1;
  input.throttle = -1;
  return input;
}
