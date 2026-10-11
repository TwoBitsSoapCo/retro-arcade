// Star Invaders sound effects, synthesized to imitate the original's analog sound board.
(function () {
  'use strict';
  const SI = (window.SI = window.SI || {});
  const A = window.ArcadeAudio;

  // The famous four-note descending "heartbeat" march.
  const MARCH = [98, 87.3, 77.8, 73.4];
  let ufoNodes = null;

  SI.sound = {
    march(i) {
      A.tone({ type: 'square', freq: MARCH[i & 3], dur: 0.1, vol: 0.3, attack: 0.002 });
      A.tone({ type: 'triangle', freq: MARCH[i & 3] / 2, dur: 0.12, vol: 0.35 });
    },
    shoot() {
      A.noise({ filter: 'bandpass', freq: 5000, freqEnd: 700, q: 2, dur: 0.28, vol: 0.35 });
      A.tone({ type: 'square', freq: 1500, freqEnd: 250, dur: 0.14, vol: 0.05 });
    },
    invaderHit() {
      A.tone({ type: 'square', freq: 1000, freqEnd: 110, dur: 0.2, vol: 0.12 });
      A.noise({ filter: 'highpass', freq: 1200, dur: 0.18, vol: 0.25 });
    },
    playerHit() {
      A.noise({ filter: 'lowpass', freq: 4000, freqEnd: 150, dur: 1.3, vol: 0.55 });
      A.tone({ type: 'sawtooth', freq: 180, freqEnd: 35, dur: 1.1, vol: 0.15 });
    },
    ufoHit() {
      for (let i = 0; i < 10; i++) A.tone({ type: 'square', freq: i % 2 ? 1100 : 1500, dur: 0.06, delay: i * 0.06, vol: 0.12 });
    },
    extraLife() {
      for (let i = 0; i < 6; i++) A.tone({ type: 'square', freq: 1760, dur: 0.05, delay: i * 0.1, vol: 0.12 });
    },
    // The mystery ship's warbling siren loops for as long as it is on screen.
    ufoStart() {
      const ctx = A.ctx;
      if (!ctx || ufoNodes) return;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 650;
      lfo.type = 'triangle';
      lfo.frequency.value = 7;
      lfoGain.gain.value = 260;
      g.gain.value = 0.05;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(g).connect(A.master);
      osc.start();
      lfo.start();
      ufoNodes = { osc, lfo, g };
    },
    ufoStop() {
      if (!ufoNodes) return;
      try {
        ufoNodes.osc.stop();
        ufoNodes.lfo.stop();
      } catch (e) {
        /* already stopped */
      }
      ufoNodes.g.disconnect();
      ufoNodes = null;
    },
  };
})();
