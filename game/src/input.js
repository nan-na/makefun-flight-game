// Golden Hour — input: keyboard and mouse, both steering the same stick.
// Keyboard: arrows fly, W/S throttle, Space brake, P pause, M mute, R restart,
// Enter start, 1/2/3 pick the aircraft, N next flight, T back to title.
// Mouse: moving the pointer steers (offset from centre), the wheel is the
// throttle, holding the left button is the brake.

export function createInput(canvas) {
  const keys = new Set();
  const pressedKeys = new Set();
  const mouse = { x: 0, y: 0, active: false, wheel: 0, brake: false };

  function keyName(e) {
    // Lower-case everything, so 'Enter' matches pressed('enter') and
    // 'ArrowUp' matches stick()'s 'arrowup' — single letters already work.
    return e.key.toLowerCase();
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const k = keyName(e);
    // Latch the press: a quick tap (down+up inside one frame) must still
    // reach pressed(), which is only polled once per animation frame.
    if (!e.repeat) pressedKeys.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouse.active = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    mouse.brake = true;
    mouse.active = true;
  });
  window.addEventListener('pointerup', () => { mouse.brake = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    mouse.wheel += -Math.sign(e.deltaY);
  }, { passive: false });
  canvas.addEventListener('pointerleave', () => { mouse.active = false; });

  /** The flight stick for this frame: pitch/roll/throttle/brake in [-1, 1]. */
  function stick() {
    let pitch = 0, roll = 0, throttle = 0, brake = 0;
    if (keys.has('arrowup')) pitch += 1;
    if (keys.has('arrowdown')) pitch -= 1;
    if (keys.has('arrowleft')) roll -= 1;
    if (keys.has('arrowright')) roll += 1;
    if (keys.has('w')) throttle += 1;
    if (keys.has('s')) throttle -= 1;
    if (keys.has(' ')) brake = 1;
    if (mouse.active) {
      // The mouse steers only when the keys are quiet, so the two never fight.
      if (roll === 0) roll = Math.max(-1, Math.min(1, mouse.x * 1.4));
      if (pitch === 0) pitch = Math.max(-1, Math.min(1, -mouse.y * 1.2));
    }
    if (mouse.wheel !== 0) {
      throttle += mouse.wheel * 0.25;
      mouse.wheel = 0;
    }
    if (mouse.brake) brake = 1;
    return { pitch, roll, throttle, brake };
  }

  /** True once when the key was pressed since the last frame. */
  function pressed(name) {
    if (pressedKeys.has(name)) {
      pressedKeys.delete(name);
      return true;
    }
    return false;
  }

  /** Call once per frame, after the keys were handled, to drop stale latches. */
  function afterFrame() { pressedKeys.clear(); }

  return { keys, mouse, stick, pressed, afterFrame };
}
