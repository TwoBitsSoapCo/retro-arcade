// Star Invaders page wiring: settings panel, keyboard, screen scaling and the main loop.
(function () {
  'use strict';
  const SI = window.SI;
  const Audio = window.ArcadeAudio;
  const Store = window.ArcadeStore;

  const DEFAULTS = { players: 1, difficulty: 'normal', speed: 1, lives: 3, bonus: 1500, overlay: true, crt: true, volume: 60 };
  const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25];

  // Only accept known values from storage. Anything unexpected falls back to the default.
  function sanitize(o) {
    const s = Object.assign({}, DEFAULTS);
    if (!o || typeof o !== 'object') return s;
    if (o.players === 1 || o.players === 2) s.players = o.players;
    if (['easy', 'normal', 'hard'].includes(o.difficulty)) s.difficulty = o.difficulty;
    if (SPEEDS.includes(o.speed)) s.speed = o.speed;
    if ([3, 4, 5, 6].includes(o.lives)) s.lives = o.lives;
    if ([0, 1000, 1500].includes(o.bonus)) s.bonus = o.bonus;
    if (typeof o.overlay === 'boolean') s.overlay = o.overlay;
    if (typeof o.crt === 'boolean') s.crt = o.crt;
    if (Number.isFinite(o.volume)) s.volume = Math.max(0, Math.min(100, Math.round(o.volume)));
    return s;
  }

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('screenWrap');
  const panel = document.getElementById('settings');
  const form = document.getElementById('settingsForm');
  const resumeBtn = document.getElementById('resumeBtn');
  const quitBtn = document.getElementById('quitBtn');
  const closeBtn = document.getElementById('closeBtn');
  const muteBtn = document.getElementById('muteBtn');

  const input = window.ArcadeInput.create({
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    fire: ['Space', 'ArrowUp', 'KeyW'],
    start: ['Enter', 'NumpadEnter'],
    select: ['Space', 'Enter', 'NumpadEnter'], // confirms a letter on the initials screen
  });

  const game = new SI.Game(SI.sound);
  let settings = sanitize(Store.get('invaders.settings', null));
  game.settings = settings;

  // ---------- touch buttons (phones and tablets) ----------

  const Touch = window.ArcadeTouch;
  const unlockAudio = () => Audio.init();
  // The arrows also tap tleft/tright, which change letters on the high-score initials screen.
  Touch.button(document.getElementById('tLeft'), input, { hold: 'left', taps: ['tleft'], onPress: unlockAudio });
  Touch.button(document.getElementById('tRight'), input, { hold: 'right', taps: ['tright'], onPress: unlockAudio });
  Touch.button(document.getElementById('tFire'), input, { taps: ['fire', 'select', 'start'], onPress: unlockAudio });
  Touch.init(() => {
    game.touch = true;
    setTimeout(fit); // after the rest of this file has set up
  });

  // ---------- settings panel ----------

  function fillForm() {
    form.players.value = String(settings.players);
    form.difficulty.value = settings.difficulty;
    form.speed.value = String(settings.speed);
    form.lives.value = String(settings.lives);
    form.bonus.value = String(settings.bonus);
    form.overlay.checked = settings.overlay;
    form.crt.checked = settings.crt;
    form.volume.value = String(settings.volume);
  }

  function readForm() {
    settings = sanitize({
      players: Number(form.players.value),
      difficulty: form.difficulty.value,
      speed: Number(form.speed.value),
      lives: Number(form.lives.value),
      bonus: Number(form.bonus.value),
      overlay: form.overlay.checked,
      crt: form.crt.checked,
      volume: Number(form.volume.value),
    });
    game.settings = settings;
    Store.set('invaders.settings', settings);
    applyLive();
  }

  // Display and sound settings take effect immediately. The rest apply to the next game.
  function applyLive() {
    game.overlay = settings.overlay;
    wrap.classList.toggle('crt', settings.crt);
    Audio.setVolume(settings.volume / 100);
  }

  function openPanel() {
    if (game.inProgress) setPaused(true);
    const playing = game.inProgress;
    resumeBtn.hidden = !playing;
    quitBtn.hidden = !playing;
    closeBtn.hidden = playing;
    panel.hidden = false;
    input.setEnabled(false);
    form.querySelector('button[type=submit]').focus();
  }

  function closePanel() {
    panel.hidden = true;
    input.setEnabled(true);
    canvas.focus();
  }

  function setPaused(on) {
    game.paused = on;
    if (on) Audio.suspend();
    else Audio.resume();
  }

  function updateMuteLabel() {
    muteBtn.textContent = Audio.isMuted() ? 'Sound: OFF' : 'Sound: ON';
  }

  form.addEventListener('input', readForm);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Audio.init();
    readForm();
    closePanel();
    setPaused(false);
    game.start();
  });
  resumeBtn.addEventListener('click', () => {
    closePanel();
    setPaused(false);
  });
  quitBtn.addEventListener('click', () => {
    setPaused(false);
    game.quit();
    openPanel();
  });
  closeBtn.addEventListener('click', closePanel);
  muteBtn.addEventListener('click', () => {
    Audio.init();
    Audio.setMuted(!Audio.isMuted());
    updateMuteLabel();
  });
  document.getElementById('settingsBtn').addEventListener('click', openPanel);

  // ---------- global keys ----------

  window.addEventListener('keydown', (e) => {
    Audio.init(); // browsers require a key press or click before sound can play
    if (e.code === 'Escape') {
      e.preventDefault();
      if (panel.hidden) openPanel();
      else {
        closePanel();
        if (game.inProgress) setPaused(false);
      }
      return;
    }
    if (!panel.hidden) return;
    if (e.code === 'KeyP' && game.inProgress) setPaused(!game.paused);
    if (e.code === 'KeyM') {
      Audio.setMuted(!Audio.isMuted());
      updateMuteLabel();
    }
  });

  // Pause automatically when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.inProgress && !game.paused) setPaused(true);
  });

  // ---------- screen scaling ----------

  function fit() {
    const { W, H } = SI.SCREEN;
    const stage = document.querySelector('.stage');
    const pad = Touch.active ? 16 : 32;
    let s = Math.min((stage.clientWidth - pad) / W, (stage.clientHeight - pad) / H);
    if (s >= 2) s = Math.floor(s); // whole-number scaling keeps pixels crisp
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
  }
  window.addEventListener('resize', fit);

  // ---------- main loop: fixed-rate logic, render every frame ----------

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const step = 1000 / (60 * settings.speed);
    acc += Math.min(now - last, 250);
    last = now;
    let n = 0;
    while (acc >= step && n < 8) {
      game.update(input);
      input.endTick();
      acc -= step;
      n++;
    }
    if (n === 8) acc = 0;
    game.render(ctx);
    requestAnimationFrame(frame);
  }

  fillForm();
  applyLive();
  updateMuteLabel();
  fit();
  openPanel();
  requestAnimationFrame(frame);
})();
