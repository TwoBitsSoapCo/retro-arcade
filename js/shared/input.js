// Shared keyboard handling. A game maps action names (like "fire") to keys,
// then asks each tick whether an action is held down or was just pressed.
(function () {
  'use strict';

  function create(bindings) {
    const down = new Set();
    const pressed = new Set();
    let typed = [];
    let enabled = true;
    const gameKeys = new Set(Object.values(bindings).flat());

    window.addEventListener('keydown', (e) => {
      if (!enabled) return;
      if (gameKeys.has(e.code)) e.preventDefault(); // stop arrows/space scrolling the page
      if (e.repeat) return;
      down.add(e.code);
      pressed.add(e.code);
      if (/^Key[A-Z]$/.test(e.code)) typed.push(e.code.charAt(3));
    });
    window.addEventListener('keyup', (e) => down.delete(e.code));
    window.addEventListener('blur', () => down.clear());

    const any = (set, action) => (bindings[action] || []).some((k) => set.has(k));

    return {
      down: (action) => any(down, action),
      pressed: (action) => any(pressed, action),
      typed: () => typed,
      // Called after each game tick so a press counts only once.
      endTick() {
        pressed.clear();
        typed = [];
      },
      setEnabled(on) {
        enabled = on;
        down.clear();
        pressed.clear();
        typed = [];
      },
    };
  }

  window.ArcadeInput = { create };
})();
