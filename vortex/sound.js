// Vortex sound effects, synthesized to evoke Atari's POKEY sound chip.
(function () {
  'use strict';
  const VX = (window.VX = window.VX || {});
  const A = window.ArcadeAudio;

  VX.sound = {
    fire() {
      A.tone({ type: 'square', freq: 1900, freqEnd: 500, dur: 0.09, vol: 0.07 });
      A.noise({ filter: 'bandpass', freq: 3500, q: 3, dur: 0.05, vol: 0.12 });
    },
    move() {
      A.tone({ type: 'triangle', freq: 2600, dur: 0.012, vol: 0.025 });
    },
    enemyHit() {
      A.noise({ filter: 'lowpass', freq: 3500, freqEnd: 250, dur: 0.3, vol: 0.32 });
      A.tone({ type: 'square', freq: 420, freqEnd: 70, dur: 0.22, vol: 0.07 });
    },
    spikeHit() {
      A.tone({ type: 'square', freq: 950, dur: 0.025, vol: 0.04 });
    },
    enemyFire() {
      A.tone({ type: 'sawtooth', freq: 260, freqEnd: 900, dur: 0.08, vol: 0.04 });
    },
    pulse() {
      A.tone({ type: 'square', freq: 55, dur: 0.35, vol: 0.05 });
    },
    playerDie() {
      A.noise({ filter: 'lowpass', freq: 5000, freqEnd: 120, dur: 1.6, vol: 0.5 });
      A.tone({ type: 'sawtooth', freq: 900, freqEnd: 40, dur: 1.3, vol: 0.12 });
      A.tone({ type: 'square', freq: 1600, freqEnd: 180, dur: 0.5, vol: 0.06 });
    },
    grab() {
      A.tone({ type: 'sawtooth', freq: 1400, freqEnd: 2600, dur: 0.25, vol: 0.06 });
    },
    zap() {
      A.noise({ filter: 'bandpass', freq: 200, freqEnd: 5000, q: 1.5, dur: 0.7, vol: 0.45 });
      A.tone({ type: 'sawtooth', freq: 60, freqEnd: 700, dur: 0.7, vol: 0.1 });
    },
    warp() {
      A.tone({ type: 'sawtooth', freq: 70, freqEnd: 1800, dur: 2.4, vol: 0.09, attack: 0.2 });
      A.tone({ type: 'square', freq: 110, freqEnd: 2600, dur: 2.4, vol: 0.035, attack: 0.2 });
    },
    levelStart() {
      [523, 659, 784, 1047].forEach((f, i) => A.tone({ type: 'square', freq: f, dur: 0.09, delay: i * 0.08, vol: 0.06 }));
    },
    extraLife() {
      for (let i = 0; i < 6; i++) A.tone({ type: 'square', freq: i % 2 ? 1568 : 2093, dur: 0.07, delay: i * 0.09, vol: 0.07 });
    },
  };
})();
