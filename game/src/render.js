// Golden Hour — the renderer: a pseudo-3D chase view over a golden-hour valley,
// plus the cockpit HUD and the title / pause / debrief / crash screens.
// Everything is vector canvas art; no images, no network.

import { FIELD, PALETTE, RUNWAY, SCORE, WORLD } from './config.js';
import { groundKind, terrainHeight } from './world.js';
import { hash2 } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_DEBRIEF = 'debrief';
export const SCREEN_CRASH = 'crash';

const FOCAL = 640;
const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Mix two #rrggbb colours. */
function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

const GROUND_COLOURS = {
  fieldA: PALETTE.fieldA, fieldB: PALETTE.fieldB, fieldC: PALETTE.fieldC,
  fieldD: PALETTE.fieldD, fieldE: PALETTE.fieldE, water: PALETTE.water,
  city: PALETTE.city, runway: PALETTE.asphalt, mountain: PALETTE.mountain,
};

/** Camera frame: position, heading and pitch the view is taken from. */
function cameraFor(world) {
  const p = world.plane;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const back = p.onGround ? 11 : 9;
  const up = p.onGround ? 3.4 : 3.0;
  return {
    x: p.x - fx * back, y: Math.max(1.2, p.y + up), z: p.z - fz * back,
    heading: p.heading, pitch: p.pitch * 0.7,
  };
}

/** Project a world point into screen space (logical 1280x720). Null when behind. */
function project(cam, cx, cy, x, y, z) {
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
  const ch = Math.cos(cam.heading), sh = Math.sin(cam.heading);
  const x1 = dx * ch - dz * sh;
  const z1 = dx * sh + dz * ch;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const y2 = dy * cp - z1 * sp;
  const z2 = dy * sp + z1 * cp;
  if (z2 < 0.6) return null;
  return { x: cx + (x1 / z2) * FOCAL, y: cy - (y2 / z2) * FOCAL, d: z2 };
}

/** Draw the sky: gradient, low sun, early stars, haze at the horizon. */
function drawSky(ctx, world, cam, cx, cy, time) {
  const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.45, PALETTE.skyMid);
  g.addColorStop(0.72, PALETTE.skyLow);
  g.addColorStop(1, PALETTE.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  // Early stars high up, fading in as the eye lifts.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i += 1) {
    const sx = hash2(i, 3, 5) * FIELD.width;
    const sy = hash2(i, 7, 5) * 170;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.7 + i));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;
  // The sun, low in the west.
  const sun = project(cam, cx, cy, cam.x - 4200, cam.y + 420, cam.z + 1300);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 190);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,154,60,0.55)');
    glow.addColorStop(1, 'rgba(255,154,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 200, sun.y - 200, 400, 400);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 34, 0, TAU);
    ctx.fill();
  }
}

/** Draw the ground as log-spaced rows of terrain quads, hazed with distance. */
function drawGround(ctx, world, cam, cx, cy) {
  const depths = [];
  for (let d = 7; d < 2400; d *= 1.28) depths.push(d);
  const cols = 12;
  const halfFov = 0.85; // wider than the screen's own half-angle (atan(640/640) = 0.785) so the ground reaches the edges
  for (let r = 0; r < depths.length - 1; r += 1) {
    const d0 = depths[r], d1 = depths[r + 1];
    const haze = clamp(d0 / 2600, 0, 0.82);
    const hazeCol = mix(PALETTE.skyLow, PALETTE.horizon, 0.6);
    for (let c = 0; c < cols; c += 1) {
      const a0 = -halfFov + (2 * halfFov * c) / cols;
      const a1 = -halfFov + (2 * halfFov * (c + 1)) / cols;
      const pts = [];
      let ok = true;
      for (const [d, a] of [[d0, a0], [d0, a1], [d1, a1], [d1, a0]]) {
        const wx = cam.x + (Math.sin(a) * d) * Math.cos(cam.heading) + Math.cos(a) * d * Math.sin(cam.heading);
        const wz = cam.z + (-Math.sin(a) * d) * Math.sin(cam.heading) + Math.cos(a) * d * Math.cos(cam.heading);
        const sp = project(cam, cx, cy, wx, 0, wz);
        if (!sp) { ok = false; break; }
        pts.push(sp);
      }
      if (!ok) continue;
      const mx = cam.x + (Math.sin((a0 + a1) / 2) * (d0 + d1) / 2) * Math.cos(cam.heading)
        + Math.cos((a0 + a1) / 2) * ((d0 + d1) / 2) * Math.sin(cam.heading);
      const mz = cam.z + (-Math.sin((a0 + a1) / 2) * ((d0 + d1) / 2)) * Math.sin(cam.heading)
        + Math.cos((a0 + a1) / 2) * ((d0 + d1) / 2) * Math.cos(cam.heading);
      const kind = groundKind(mx, mz);
      ctx.fillStyle = mix(GROUND_COLOURS[kind] ?? PALETTE.fieldA, hazeCol, haze);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Runway centreline dashes and threshold bars.
  ctx.fillStyle = PALETTE.runwayMark;
  for (let z = RUNWAY.z0 + 20; z < RUNWAY.z1 - 10; z += 30) {
    const a = project(cam, cx, cy, RUNWAY.x - 0.8, 0.15, z);
    const b = project(cam, cx, cy, RUNWAY.x + 0.8, 0.15, z + 14);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(a.x, b.y);
    ctx.closePath(); ctx.fill();
  }
  const th = project(cam, cx, cy, RUNWAY.x, 0.15, RUNWAY.z0 + 30);
  if (th && th.d > 200 && th.d < 900) {
    ctx.font = '700 ' + Math.max(10, Math.min(30, 900 / th.d * 14)) + 'px ' + 'system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(242,234,216,0.9)';
    ctx.fillText('27', th.x, th.y);
  }
  // The mountain ridge, a tall jagged silhouette on the northern horizon.
  // It stands far beyond the ground rows (mountainZ + 900, full height) so it
  // reads as distant peaks, never as a flat wall across the screen.
  const ridgeZ = WORLD.mountainZ + 900;
  const ridgePts = [];
  for (let x = -4200; x <= 4200; x += 140) {
    // Amplify the peaks so the crest is jagged, not a flat bar.
    const h = terrainHeight(x, ridgeZ) * 1.7 + 30;
    const sp = project(cam, cx, cy, x, h, ridgeZ);
    if (sp) ridgePts.push(sp);
  }
  // Run the silhouette off both screen edges so no vertical cut shows mid-frame.
  if (ridgePts.length > 1) {
    ridgePts.unshift({ x: -80, y: ridgePts[0].y, d: ridgePts[0].d });
    ridgePts.push({ x: FIELD.width + 80, y: ridgePts[ridgePts.length - 1].y, d: ridgePts[ridgePts.length - 1].d });
    const baseY = Math.max(...ridgePts.map((q) => q.y)) + 60;
    ctx.beginPath();
    ctx.moveTo(ridgePts[0].x, ridgePts[0].y);
    for (const q of ridgePts) ctx.lineTo(q.x, q.y);
    ctx.lineTo(ridgePts[ridgePts.length - 1].x, baseY);
    ctx.lineTo(ridgePts[0].x, baseY);
    ctx.closePath();
    ctx.fillStyle = mix(PALETTE.mountain, '#b45a7a', 0.4);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,217,200,0.5)';
    for (let x = -4000; x <= 4000; x += 460) {
      const h = terrainHeight(x, ridgeZ) * 1.7 + 30;
      if (h < 420) continue;
      const sp = project(cam, cx, cy, x, h + 12, ridgeZ);
      if (sp) { ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, TAU); ctx.fill(); }
    }
  }
}

/** Draw billboards: trees, buildings, clouds, rings, the windsock. */
function drawObjects(ctx, world, cam, cx, cy, time) {
  const p = world.plane;
  const items = [];
  for (const t of world.scenery.trees) {
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < 1400) items.push({ d, kind: 'tree', o: t });
  }
  for (const b of world.scenery.buildings) {
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < 1600) items.push({ d, kind: 'building', o: b });
  }
  for (const c of world.scenery.clouds) {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < 3800) items.push({ d, kind: 'cloud', o: c });
  }
  for (const r of world.rings) items.push({ d: Math.hypot(r.x - p.x, r.y - p.y, r.z - p.z), kind: 'ring', o: r });
  items.sort((a, b) => b.d - a.d);
  for (const item of items) {
    if (item.kind === 'tree') {
      const t = item.o;
      const base = project(cam, cx, cy, t.x, 0, t.z);
      const top = project(cam, cx, cy, t.x, t.h, t.z);
      if (!base || !top) continue;
      const s = FOCAL / Math.max(1, base.d);
      ctx.strokeStyle = '#4a3220';
      ctx.lineWidth = Math.max(1, 2.2 * s / 10);
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y - t.h * s * 0.4); ctx.stroke();
      ctx.fillStyle = '#5d7a35';
      ctx.beginPath(); ctx.arc(top.x, top.y - t.h * s * 0.5, Math.max(2, t.w * s * 0.55), 0, TAU); ctx.fill();
      ctx.fillStyle = '#7d9b3f';
      ctx.beginPath(); ctx.arc(top.x - t.w * s * 0.3, top.y - t.h * s * 0.35, Math.max(1.5, t.w * s * 0.35), 0, TAU); ctx.fill();
    } else if (item.kind === 'building') {
      const b = item.o;
      const base = project(cam, cx, cy, b.x, 0, b.z);
      const top = project(cam, cx, cy, b.x, b.h, b.z);
      if (!base || !top) continue;
      const s = FOCAL / Math.max(1, base.d);
      const w = b.w * s, h = (top.y - base.y) * -1;
      if (w < 2 || h < 3) continue;
      ctx.fillStyle = mix(PALETTE.city, PALETTE.skyLow, clamp(base.d / 2200, 0, 0.6));
      ctx.fillRect(base.x - w / 2, base.y - h, w, h);
      ctx.fillStyle = PALETTE.cityRoof;
      ctx.fillRect(base.x - w / 2, base.y - h, w, Math.max(2, h * 0.08));
      ctx.fillStyle = 'rgba(255,214,130,0.75)';
      for (let wy = 0; wy < 3; wy += 1) {
        for (let wx = 0; wx < 3; wx += 1) {
          if (hash2(Math.floor(b.x), wy * 3 + wx, 3) < 0.45) {
            ctx.fillRect(base.x - w / 2 + w * (0.2 + wx * 0.28), base.y - h + h * (0.2 + wy * 0.26), Math.max(1, w * 0.12), Math.max(1, h * 0.1));
          }
        }
      }
    } else if (item.kind === 'cloud') {
      const c = item.o;
      const cxw = c.x + ((time * c.drift) % 600);
      const sp = project(cam, cx, cy, cxw, c.y, c.z);
      if (!sp) continue;
      const s = (FOCAL / Math.max(1, sp.d)) * c.s / 40;
      if (s < 3) continue;
      ctx.fillStyle = 'rgba(255,217,168,0.55)';
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, s, s * 0.32, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sp.x - s * 0.5, sp.y + s * 0.06, s * 0.6, s * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sp.x + s * 0.5, sp.y + s * 0.05, s * 0.65, s * 0.26, 0, 0, TAU); ctx.fill();
    } else if (item.kind === 'ring') {
      const r = item.o;
      const sp = project(cam, cx, cy, r.x, r.y, r.z);
      if (!sp) continue;
      const R = (r.r * FOCAL) / Math.max(1, sp.d);
      if (R < 2) continue;
      const col = r.passed ? PALETTE.ringDone
        : (world.nextRing === r ? PALETTE.ringNext : PALETTE.ringOther);
      ctx.save();
      ctx.globalAlpha = r.passed ? 0.45 : 0.95;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, R * 0.14);
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, R, R * 0.62, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      if (world.nextRing === r && world.screen !== 'title') {
        ctx.fillStyle = PALETTE.hud;
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', sp.x, sp.y - R * 0.62 - 12);
      }
      // A tether line to the ground, so the ring's height reads at a glance.
      const g = project(cam, cx, cy, r.x, 0, r.z);
      if (g) {
        ctx.strokeStyle = 'rgba(255,246,224,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(g.x, g.y); ctx.stroke();
      }
    }
  }
  // Windsock beside the runway.
  const ws = project(cam, cx, cy, RUNWAY.x + 22, 9, 120);
  if (ws && ws.d < 1200) {
    const s = FOCAL / Math.max(1, ws.d);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = Math.max(1, 1.6 * s / 10);
    ctx.beginPath(); ctx.moveTo(ws.x, ws.y + 9 * s / 10); ctx.lineTo(ws.x, ws.y); ctx.stroke();
    ctx.fillStyle = '#ff7a3c';
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y);
    ctx.lineTo(ws.x + clamp(world.wind.x * 2.2, -30, 30) * (s / 22), ws.y + 3);
    ctx.lineTo(ws.x, ws.y + 6);
    ctx.closePath(); ctx.fill();
  }
}

/** The aircraft, seen from chase view, banking with the turn. */
function drawPlane(ctx, world, cam, cx, cy, time) {
  const p = world.plane;
  const px = cx;
  const py = cy + 148;
  // Shadow on the ground while low.
  if (p.y < 220) {
    const sh = project(cam, cx, cy, p.x, 0.3, p.z);
    if (sh) {
      const a = clamp(0.4 - p.y / 600, 0.06, 0.4);
      const s = clamp(90 - p.y * 0.22, 18, 90);
      ctx.fillStyle = 'rgba(20,8,20,' + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(sh.x, sh.y, s, s * 0.32, 0, 0, TAU); ctx.fill();
    }
  }
  const ac = world.aircraft;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.bank * 0.85);
  const prop = time * 42;
  // Wings.
  ctx.fillStyle = ac.colour;
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-14, -8); ctx.lineTo(-10, 10); ctx.lineTo(-112, 22); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(118, 6); ctx.lineTo(14, -8); ctx.lineTo(10, 10); ctx.lineTo(112, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = ac.accent;
  ctx.beginPath(); ctx.moveTo(-118, 6); ctx.lineTo(-100, 9); ctx.lineTo(-104, 21); ctx.lineTo(-112, 22); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(118, 6); ctx.lineTo(100, 9); ctx.lineTo(104, 21); ctx.lineTo(112, 22); ctx.closePath(); ctx.fill();
  // Tail.
  ctx.fillStyle = ac.accent;
  ctx.beginPath(); ctx.moveTo(-34, 52); ctx.lineTo(-8, 44); ctx.lineTo(-8, 56); ctx.lineTo(-30, 62); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(34, 52); ctx.lineTo(8, 44); ctx.lineTo(8, 56); ctx.lineTo(30, 62); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 62); ctx.lineTo(-7, 38); ctx.lineTo(7, 38); ctx.closePath(); ctx.fill();
  // Fuselage.
  const grad = ctx.createLinearGradient(-12, 0, 12, 0);
  grad.addColorStop(0, '#e8d3a8');
  grad.addColorStop(0.5, ac.colour);
  grad.addColorStop(1, '#c9a86f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -78);
  ctx.quadraticCurveTo(13, -60, 12, -20);
  ctx.quadraticCurveTo(11, 30, 7, 62);
  ctx.quadraticCurveTo(0, 68, -7, 62);
  ctx.quadraticCurveTo(-11, 30, -12, -20);
  ctx.quadraticCurveTo(-13, -60, 0, -78);
  ctx.fill();
  // Canopy.
  ctx.fillStyle = '#20344e';
  ctx.beginPath(); ctx.ellipse(0, -46, 8, 16, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-2, -52, 3, 6, 0, 0, TAU); ctx.fill();
  // Propeller disc and blades.
  ctx.fillStyle = 'rgba(40,30,40,0.28)';
  ctx.beginPath(); ctx.ellipse(0, -82, 26, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(30,22,30,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(prop) * 24, -82 - Math.sin(prop) * 6);
  ctx.lineTo(Math.cos(prop) * 24, -82 + Math.sin(prop) * 6);
  ctx.stroke();
  // Nav lights.
  const blink = Math.sin(time * 6) > 0;
  ctx.fillStyle = blink ? '#ff4d4d' : '#7a2020';
  ctx.beginPath(); ctx.arc(-116, 12, 3.4, 0, TAU); ctx.fill();
  ctx.fillStyle = blink ? '#4dff88' : '#1d5c33';
  ctx.beginPath(); ctx.arc(116, 12, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
}

/** The HUD: airspeed, altitude, heading, throttle, fuel, damage, mission. */
function drawHud(ctx, world, ui) {
  const p = world.plane;
  const ac = world.aircraft;
  const knots = Math.round(p.speed * 1.944);
  const altM = Math.max(0, Math.round(p.y));
  const vs = p.verticalSpeed;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Left instrument block.
  panel(ctx, 18, 16, 240, 118);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('AIRSPEED', 32, 38);
  ctx.fillText('ALTITUDE', 32, 74);
  ctx.fillText('VERT SPEED', 32, 110);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText(knots + ' kt', 132, 42);
  ctx.fillText(altM + ' m', 132, 78);
  ctx.fillText((vs >= 0 ? '+' : '') + vs.toFixed(1) + ' m/s', 132, 114);
  // Compass strip.
  const cx = FIELD.width / 2;
  panel(ctx, cx - 190, 16, 380, 44);
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - 190, 16, 380, 44); ctx.clip();
  const headingDeg = ((p.heading * 180 / Math.PI) % 360 + 360) % 360;
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const h = Math.round((headingDeg + d) / 15) * 15;
    const x = cx + d * 2.4;
    const label = h % 90 === 0 ? ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' })[((h % 360) + 360) % 360] : String(((h % 360) + 360) % 360);
    ctx.fillText(label, x, 48);
    ctx.fillRect(x - 0.5, 24, 1, h % 45 === 0 ? 10 : 6);
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.ringNext;
  ctx.beginPath(); ctx.moveTo(cx, 20); ctx.lineTo(cx - 5, 30); ctx.lineTo(cx + 5, 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, 74);
  // Right block: throttle, fuel, damage, wind.
  panel(ctx, FIELD.width - 258, 16, 240, 118);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('THROTTLE', FIELD.width - 244, 38);
  ctx.fillText('FUEL', FIELD.width - 244, 74);
  ctx.fillText('WIND', FIELD.width - 244, 110);
  bar(ctx, FIELD.width - 170, 28, 138, 10, p.throttle, PALETTE.ringNext);
  const fuelFrac = world.fuel / 100;
  bar(ctx, FIELD.width - 170, 64, 138, 10, fuelFrac, fuelFrac < 0.22 ? PALETTE.hudWarn : PALETTE.hudGood);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(Math.round(world.fuel) + '%', FIELD.width - 170, 112);
  ctx.fillText((world.wind.x < 0 ? '← ' : '→ ') + Math.abs(Math.round(world.wind.speed)) + ' m/s', FIELD.width - 118, 112);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('AIRFRAME', FIELD.width - 244, 130 - 8 + 8);
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i < world.damage ? PALETTE.hudWarn : PALETTE.hudGood;
    ctx.beginPath(); ctx.arc(FIELD.width - 158 + i * 20, 126, 5, 0, TAU); ctx.fill();
  }
  // Mission line under the compass.
  ctx.textAlign = 'center';
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hud;
  const legText = world.leg === 'takeoff' ? 'TAKEOFF — climb past 50 m'
    : world.leg === 'rings' ? 'RING COURSE — ' + world.ringsHit + '/' + world.rings.length + ' rings'
    : world.leg === 'landing' ? 'LANDING — runway 27, gear down'
    : 'FLIGHT COMPLETE';
  ctx.fillText(legText, cx, 100);
  const ring = world.nextRing;
  if (ring && world.leg === 'rings') {
    const d = Math.round(Math.hypot(ring.x - p.x, ring.y - p.y, ring.z - p.z));
    ctx.fillStyle = PALETTE.ringNext;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('next ring ' + d + ' m', cx, 120);
  }
  // Score and time, bottom right; aircraft and day, bottom left.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillText('SCORE ' + world.score, FIELD.width - 18, FIELD.height - 44);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText('DAY ' + world.day + '  ·  ' + fmtTime(world.time) + '  ·  BEST ' + Math.max(world.best, world.score), FIELD.width - 18, FIELD.height - 22);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(ac.name + '  ·  ' + (world.fuelEmpty ? 'NO FUEL' : 'GEAR ' + (p.onGround ? 'DOWN' : 'UP')), 18, FIELD.height - 22);
  // Message banner.
  if (world.messageTimer > 0 && world.message) {
    ctx.globalAlpha = clamp(world.messageTimer, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(world.message, cx, 168);
    ctx.globalAlpha = 1;
  }
  // Stall / fuel warnings.
  if (world.stalled) {
    const blink = Math.sin(ui.time * 10) > 0;
    ctx.strokeStyle = blink ? PALETTE.hudWarn : 'rgba(255,90,78,0.25)';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, FIELD.width - 8, FIELD.height - 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudWarn;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText('⚠ STALL — NOSE DOWN, POWER UP', cx, 210);
  } else if (world.fuelEmpty) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudWarn;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('FUEL EMPTY — GLIDE HER HOME', cx, 210);
  }
  // Mouse steer hint while playing.
  if (ui.showMouseHint) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('Mouse steers · wheel = throttle · W/S throttle · arrows fly · Space brake · P pause · M mute', cx, FIELD.height - 46);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, colour) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** Title screen: the parked plane at sunset, three aircraft to pick from. */
function drawTitle(ctx, world, ui) {
  ctx.fillStyle = 'rgba(16,8,28,0.45)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText('GOLDEN HOUR', FIELD.width / 2, 150);
  ctx.fillStyle = PALETTE.ringNext;
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText('— THE SUNSET CIRCUIT —', FIELD.width / 2, 192);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('Take off at sunset. Thread six golden rings. Bring her home on runway 27.', FIELD.width / 2, 224);
  ctx.fillText('Fuel is finite. The wind is not on your side. Fly like it matters.', FIELD.width / 2, 248);
  const cards = [
    { key: 'sparrow', x: FIELD.width / 2 - 365 },
    { key: 'falcon', x: FIELD.width / 2 - 115 },
    { key: 'comet', x: FIELD.width / 2 + 135 },
  ];
  for (const card of cards) {
    const ac = { sparrow: { name: 'Sparrow', blurb: 'Trainer — gentle, forgiving' }, falcon: { name: 'Falcon', blurb: 'All-rounder — the standard' }, comet: { name: 'Comet', blurb: 'Racer — fast, thirsty' } }[card.key];
    const locked = (card.key === 'falcon' && ui.stars < 1) || (card.key === 'comet' && ui.stars < 3);
    const selected = ui.selectedAircraft === card.key;
    ctx.fillStyle = selected ? 'rgba(255,201,60,0.22)' : PALETTE.panel;
    ctx.strokeStyle = selected ? PALETTE.ringNext : PALETTE.panelEdge;
    ctx.lineWidth = selected ? 2.5 : 1;
    roundRect(ctx, card.x, 290, 230, 130, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(ac.name + (locked ? '  🔒' : ''), card.x + 115, 326);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(ac.blurb, card.x + 115, 352);
    ctx.fillText(locked ? (card.key === 'falcon' ? 'Earn 1 star to unlock' : 'Earn 3 stars to unlock') : 'Press ' + (card.key === 'sparrow' ? '1' : card.key === 'falcon' ? '2' : '3'), card.x + 115, 376);
    ctx.fillText(selected ? '★ SELECTED' : '', card.x + 115, 400);
  }
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText('Press ENTER or click to fly', FIELD.width / 2, 470);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText('Arrows / mouse steer  ·  W/S or wheel: throttle  ·  Space: brake  ·  P: pause  ·  M: mute', FIELD.width / 2, 500);
  if (ui.best > 0) {
    ctx.fillStyle = PALETTE.ringNext;
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('BEST SCORE ' + ui.best + '   ·   ' + ui.stars + '★ EARNED', FIELD.width / 2, 534);
  }
}

function drawPause(ctx) {
  ctx.fillStyle = 'rgba(10,6,20,0.66)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '800 52px system-ui, sans-serif';
  ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText('P or click to resume', FIELD.width / 2, FIELD.height / 2 + 28);
}

function drawDebrief(ctx, world, ui) {
  const d = world.debrief;
  ctx.fillStyle = 'rgba(10,6,20,0.6)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  const x = FIELD.width / 2 - 280, y = 120, w = 560, h = 440;
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText('FLIGHT COMPLETE', FIELD.width / 2, y + 52);
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.ringNext;
  ctx.fillText('★'.repeat(d.stars) + '☆'.repeat(3 - d.stars), FIELD.width / 2, y + 112);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillText(d.score + ' points', FIELD.width / 2, y + 158);
  ctx.textAlign = 'left';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudDim;
  const rows = [
    ['Rings flown', d.rings + ' / ' + world.rings.length],
    ['Landing', d.landing ? ('centre ' + d.landing.centreErr.toFixed(1) + ' m · sink ' + d.landing.sink.toFixed(1) + ' m/s' + (d.landing.inZone ? ' · in the zone' : ' · long/short')) : '—'],
    ['Landing points', d.landing ? String(d.landing.centrePts + d.landing.sinkPts + d.landing.speedPts + d.landing.zonePts) : '—'],
    ['Time bonus', '+' + (d.landing ? d.landing.timeBonus : 0)],
    ['Fuel left', d.fuelLeft + '%'],
    ['Damage', d.damage + ' / 3'],
    ['Flight time', fmtTime(d.time)],
    ['Best score', String(Math.max(ui.best, d.score))],
  ];
  rows.forEach((row, i) => {
    const ry = y + 196 + i * 26;
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(row[0], x + 40, ry);
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = 'right';
    ctx.fillText(row[1], x + w - 40, ry);
    ctx.textAlign = 'left';
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('N — next flight (day ' + (d.day + 1) + ', harder wind)   ·   R — fly again', FIELD.width / 2, y + h - 26);
}

function drawCrash(ctx, world) {
  ctx.fillStyle = 'rgba(60,8,10,0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb3ad';
  ctx.font = '800 52px system-ui, sans-serif';
  ctx.fillText('CRASHED', FIELD.width / 2, FIELD.height / 2 - 30);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText('You ' + world.crashReason + '.', FIELD.width / 2, FIELD.height / 2 + 8);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('Score ' + world.score + '  ·  R — try again   ·   T — back to title', FIELD.width / 2, FIELD.height / 2 + 44);
}

/** Top-level draw: world (rolled with the bank), plane, HUD, then the screen. */
export function render(ctx, world, ui) {
  const cx = FIELD.width / 2;
  const cy = FIELD.height / 2;
  const cam = cameraFor(world);
  const p = world.plane;
  drawSky(ctx, world, cam, cx, cy, ui.time);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-p.bank * 0.22);
  ctx.translate(-cx, -cy);
  drawGround(ctx, world, cam, cx, cy);
  drawObjects(ctx, world, cam, cx, cy, ui.time);
  ctx.restore();
  if (world.screen !== SCREEN_TITLE) drawPlane(ctx, world, cam, cx, cy, ui.time);
  if (world.screen === SCREEN_PLAY || world.screen === SCREEN_PAUSE) drawHud(ctx, world, ui);
  if (world.screen === SCREEN_TITLE) {
    // The parked plane still shows on the strip behind the title card.
    drawPlane(ctx, world, cam, cx, cy, ui.time);
    drawTitle(ctx, world, ui);
  }
  if (world.screen === SCREEN_PAUSE) drawPause(ctx);
  if (world.screen === SCREEN_DEBRIEF) drawDebrief(ctx, world, ui);
  if (world.screen === SCREEN_CRASH) drawCrash(ctx, world);
}

export { fmtTime };
