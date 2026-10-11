// Shared sound engine. Every sound is synthesized live with the Web Audio API,
// the same way the original arcade boards made sound in hardware, so no audio files are needed.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let volume = 0.6;
  let muted = false;

  // Browsers only allow audio after a click or key press, so init() runs on the first one.
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyGain();

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function applyGain() {
    if (master) master.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);
  }

  function envelope(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // A single oscillator note, optionally sliding in pitch.
  function tone(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq || 440, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + dur);
    envelope(g, t, o.vol == null ? 0.2 : o.vol, o.attack || 0.003, dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // A burst of filtered white noise (explosions, hiss, zaps).
  function noise(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.2;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    envelope(g, t, o.vol == null ? 0.2 : o.vol, o.attack || 0.003, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  window.ArcadeAudio = {
    init,
    tone,
    noise,
    get ctx() { return ctx; },
    get master() { return master; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); applyGain(); },
    setMuted(m) { muted = !!m; applyGain(); },
    isMuted() { return muted; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };
})();
