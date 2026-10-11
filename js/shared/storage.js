// Shared saving of settings and high scores in the player's own browser (localStorage).
// Nothing ever leaves the device. Everything read back is validated, since storage can be edited or corrupted.
(function () {
  'use strict';

  const PREFIX = 'retro-arcade.';
  const MAX_SCORES = 10;

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* storage full or blocked: the game still works, it just won't remember */
    }
  }

  function loadScores(game) {
    const list = get(game + '.hiscores', []);
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && typeof s.initials === 'string' && Number.isFinite(s.score))
      .map((s) => ({ initials: s.initials.replace(/[^A-Z]/g, '').slice(0, 3), score: Math.max(0, Math.floor(s.score)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  }

  function qualifies(list, score) {
    return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
  }

  function addScore(game, list, initials, score) {
    list.push({ initials, score });
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(list.length, MAX_SCORES);
    set(game + '.hiscores', list);
    return list;
  }

  window.ArcadeStore = { get, set, loadScores, qualifies, addScore };
})();
