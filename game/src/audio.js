// Golden Hour — sound: everything is synthesized with Web Audio, no audio files.
// Engine hum follows the throttle, wind noise follows the airspeed, and the
// ring chime, touchdown thud, stall warning and fanfare are short synth blips.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let stallBeepAt = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'triangle';
      engineOsc2.frequency.value = 110;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Continuous engine + wind, called every frame with the live state. */
    update(throttle, speed, stalled, time) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(48 + throttle * 95, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(96 + throttle * 190, t, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.11, t, 0.1);
      windFilter.frequency.setTargetAtTime(420 + speed * 9, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0016), t, 0.12);
      if (stalled && time - stallBeepAt > 0.45) {
        stallBeepAt = time;
        blip(880, 0.09, 'square', 0.1);
      }
    },
    ring(combo) {
      const base = 660 + Math.min(combo, 6) * 55;
      blip(base, 0.22, 'sine', 0.22);
      blip(base * 1.5, 0.26, 'sine', 0.18, 0.07);
      blip(base * 2, 0.3, 'sine', 0.12, 0.14);
    },
    touchdown() {
      blip(70, 0.3, 'sine', 0.4);
      blip(140, 0.18, 'triangle', 0.2, 0.02);
    },
    hard() { blip(160, 0.22, 'sawtooth', 0.2); blip(90, 0.3, 'square', 0.16, 0.05); },
    crash() {
      blip(220, 0.5, 'sawtooth', 0.25);
      blip(110, 0.7, 'sawtooth', 0.22, 0.1);
      blip(55, 0.9, 'sine', 0.3, 0.15);
    },
    fanfare(stars) {
      const notes = [523, 659, 784, 1047];
      const n = stars >= 3 ? 4 : stars === 2 ? 3 : 2;
      for (let i = 0; i < n; i += 1) blip(notes[i], 0.3, 'triangle', 0.2, i * 0.12);
    },
    click() { blip(1200, 0.05, 'sine', 0.08); },
    leg() { blip(880, 0.12, 'sine', 0.14); blip(1174, 0.16, 'sine', 0.12, 0.08); },
  };
}
