// Shared touch-screen support: detects phones/tablets and wires up on-screen buttons and slide pads.
// Uses pointer events, so several fingers can press different buttons at once.
(function () {
  'use strict';

  const listeners = [];

  function enable() {
    if (document.body.classList.contains('touch')) return;
    document.body.classList.add('touch');
    listeners.forEach((fn) => fn());
  }

  // Calls onEnable once the device turns out to be a touch device (now, or on its first touch).
  function init(onEnable) {
    if (onEnable) listeners.push(onEnable);
    if (window.matchMedia('(pointer: coarse)').matches) enable();
    window.addEventListener('touchstart', enable, { once: true, passive: true });
  }

  function track(el, handlers) {
    const active = new Set();
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const first = active.size === 0;
      active.add(e.pointerId);
      el.classList.add('pressed');
      handlers.down(e, first);
    });
    el.addEventListener('pointermove', (e) => {
      if (active.has(e.pointerId) && handlers.move) handlers.move(e);
    });
    const end = (e) => {
      if (!active.delete(e.pointerId)) return;
      if (active.size === 0) {
        el.classList.remove('pressed');
        handlers.up(e);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // A button that holds an action while touched and taps some actions when first touched.
  function button(el, input, opts) {
    track(el, {
      down(e, first) {
        if (opts.onPress) opts.onPress();
        if (!first) return;
        if (opts.hold) input.hold(opts.hold, true);
        (opts.taps || []).forEach((a) => input.tap(a));
      },
      up() {
        if (opts.hold) input.hold(opts.hold, false);
      },
    });
  }

  // A strip you slide a finger along. onSlide receives the horizontal movement in CSS pixels.
  function pad(el, onSlide, onPress) {
    let lastX = 0;
    track(el, {
      down(e) {
        lastX = e.clientX;
        if (onPress) onPress();
      },
      move(e) {
        onSlide(e.clientX - lastX);
        lastX = e.clientX;
      },
      up() {},
    });
  }

  window.ArcadeTouch = {
    init,
    button,
    pad,
    get active() {
      return document.body.classList.contains('touch');
    },
  };
})();
