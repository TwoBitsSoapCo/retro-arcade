// Vortex page wiring: settings panel, keyboard and mouse spinner, screen scaling and the main loop.
(function () {
  'use strict';
  const VX = window.VX;
  const Audio = window.ArcadeAudio;
  const Store = window.ArcadeStore;

  const DEFAULTS = {
    players: 1, startLevel: 1, difficulty: 'normal', speed: 1, lives: 3, bonus: 20000,
    spin: 'normal', mouse: false, autofire: false,
    glow: !window.matchMedia('(pointer: coarse)').matches, // the glow is heavy for phones, so off there by default
    volume: 60,
  };
  const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25];
  const START_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15, 17];
  const MOUSE_PIXELS_PER_LANE = 18;
  const TOUCH_PIXELS_PER_LANE = 16;

  // Only accept known values from storage. Anything unexpected falls back to the default.
  function sanitize(o) {
    const s = Object.assign({}, DEFAULTS);
    if (!o || typeof o !== 'object') return s;
    if (o.players === 1 || o.players === 2) s.players = o.players;
    if (START_LEVELS.includes(o.startLevel)) s.startLevel = o.startLevel;
    if (['easy', 'normal', 'hard'].includes(o.difficulty)) s.difficulty = o.difficulty;
    if (SPEEDS.includes(o.speed)) s.speed = o.speed;
    if ([3, 4, 5].includes(o.lives)) s.lives = o.lives;
    if ([0, 10000, 20000, 30000].includes(o.bonus)) s.bonus = o.bonus;
    if (['slow', 'normal', 'fast'].includes(o.spin)) s.spin = o.spin;
    if (typeof o.mouse === 'boolean') s.mouse = o.mouse;
    if (typeof o.autofire === 'boolean') s.autofire = o.autofire;
    if (typeof o.glow === 'boolean') s.glow = o.glow;
    if (Number.isFinite(o.volume)) s.volume = Math.max(0, Math.min(100, Math.round(o.volume)));
    return s;
  }

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('settings');
  const form = document.getElementById('settingsForm');
  const resumeBtn = document.getElementById('resumeBtn');
  const quitBtn = document.getElementById('quitBtn');
  const closeBtn = document.getElementById('closeBtn');
  const muteBtn = document.getElementById('muteBtn');
  const mouseHint = document.getElementById('mouseHint');

  const keys = window.ArcadeInput.create({
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    fire: ['Space', 'ArrowUp', 'KeyW'],
    zap: ['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'],
    start: ['Enter', 'NumpadEnter'],
    select: ['Space', 'Enter', 'NumpadEnter'],
  });

  // ---------- mouse spinner (optional) ----------
  // With the mouse locked to the game, sliding it left and right turns the claw like the original's rotary knob.
  const mouse = { acc: 0, fire: false, firePressed: false, zap: false };
  const locked = () => document.pointerLockElement === canvas;

  canvas.addEventListener('mousedown', (e) => {
    Audio.init();
    if (!settings.mouse || !panel.hidden) return;
    if (!locked()) {
      canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      mouse.fire = true;
      mouse.firePressed = true;
    }
    if (e.button === 2) mouse.zap = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.fire = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (locked()) mouse.acc += e.movementX;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Pressing Esc releases the mouse before the page sees the key, so treat that as "open the menu".
  document.addEventListener('pointerlockchange', () => {
    mouse.fire = false;
    if (!locked() && game.inProgress && panel.hidden) openPanel();
    updateMouseHint();
  });

  // Combined keyboard + mouse + touch controls handed to the game each tick.
  let touchAcc = 0;
  const input = {
    down: (a) => keys.down(a) || (a === 'fire' && (mouse.fire || settings.autofire)),
    pressed: (a) => keys.pressed(a) || (a === 'fire' && mouse.firePressed) || (a === 'zap' && mouse.zap),
    typed: () => keys.typed(),
    spin() {
      const m = Math.trunc(mouse.acc / MOUSE_PIXELS_PER_LANE);
      mouse.acc -= m * MOUSE_PIXELS_PER_LANE;
      const t = Math.trunc(touchAcc / TOUCH_PIXELS_PER_LANE);
      touchAcc -= t * TOUCH_PIXELS_PER_LANE;
      return m + t;
    },
    endTick() {
      keys.endTick();
      mouse.firePressed = false;
      mouse.zap = false;
    },
  };

  const game = new VX.Game(VX.sound);
  let settings = sanitize(Store.get('vortex.settings', null));
  game.settings = settings;

  // ---------- touch controls (phones and tablets) ----------

  const Touch = window.ArcadeTouch;
  const unlockAudio = () => Audio.init();
  Touch.pad(document.getElementById('tSpin'), (dx) => { touchAcc += dx; }, unlockAudio);
  Touch.button(document.getElementById('tFire'), keys, { hold: 'fire', taps: ['fire', 'select', 'start'], onPress: unlockAudio });
  Touch.button(document.getElementById('tZap'), keys, { taps: ['zap'], onPress: unlockAudio });
  Touch.init(() => {
    game.touch = true;
    setTimeout(fit); // after the rest of this file has set up
  });

  // ---------- settings panel ----------

  function fillForm() {
    form.players.value = String(settings.players);
    form.startLevel.value = String(settings.startLevel);
    form.difficulty.value = settings.difficulty;
    form.speed.value = String(settings.speed);
    form.lives.value = String(settings.lives);
    form.bonus.value = String(settings.bonus);
    form.spin.value = settings.spin;
    form.mouse.checked = settings.mouse;
    form.autofire.checked = settings.autofire;
    form.glow.checked = settings.glow;
    form.volume.value = String(settings.volume);
  }

  function readForm() {
    settings = sanitize({
      players: Number(form.players.value),
      startLevel: Number(form.startLevel.value),
      difficulty: form.difficulty.value,
      speed: Number(form.speed.value),
      lives: Number(form.lives.value),
      bonus: Number(form.bonus.value),
      spin: form.spin.value,
      mouse: form.mouse.checked,
      autofire: form.autofire.checked,
      glow: form.glow.checked,
      volume: Number(form.volume.value),
    });
    game.settings = settings;
    Store.set('vortex.settings', settings);
    applyLive();
  }

  function applyLive() {
    game.glow = settings.glow;
    Audio.setVolume(settings.volume / 100);
    updateMouseHint();
  }

  function updateMouseHint() {
    mouseHint.hidden = !settings.mouse || locked();
  }

  function openPanel() {
    if (game.inProgress) setPaused(true);
    if (locked()) document.exitPointerLock();
    const playing = game.inProgress;
    resumeBtn.hidden = !playing;
    quitBtn.hidden = !playing;
    closeBtn.hidden = playing;
    panel.hidden = false;
    keys.setEnabled(false);
    form.querySelector('button[type=submit]').focus();
  }

  function closePanel() {
    panel.hidden = true;
    keys.setEnabled(true);
    canvas.focus();
    if (settings.mouse && game.inProgress) canvas.requestPointerLock();
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
    setPaused(false);
    game.start();
    closePanel();
  });
  resumeBtn.addEventListener('click', () => {
    setPaused(false);
    closePanel();
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
    Audio.init();
    if (e.code === 'Escape') {
      e.preventDefault();
      if (panel.hidden) openPanel();
      else {
        if (game.inProgress) setPaused(false);
        closePanel();
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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.inProgress && !game.paused) setPaused(true);
  });

  // ---------- screen scaling: sharp vector lines at any size ----------

  let viewScale = 1;
  function fit() {
    const { W, H } = VX.SCREEN;
    const stage = document.querySelector('.stage');
    const pad = Touch.active ? 16 : 32;
    const s = Math.min((stage.clientWidth - pad) / W, (stage.clientHeight - pad) / H);
    const cssW = Math.max(150, Math.floor(W * s));
    const cssH = Math.max(200, Math.floor(H * s));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    viewScale = canvas.width / W;
  }
  window.addEventListener('resize', fit);

  // ---------- main loop ----------

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
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
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
