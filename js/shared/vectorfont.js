// A line-drawn "vector" font in the style of early-80s vector arcade games.
// Each glyph is one or more strokes on a 4-wide by 6-tall grid. "|" separates strokes.
(function () {
  'use strict';

  const RAW = {
    '0': '0,0 4,0 4,6 0,6 0,0', '1': '1,1 2,0 2,6|1,6 3,6', '2': '0,0 4,0 4,3 0,3 0,6 4,6',
    '3': '0,0 4,0 4,6 0,6|0,3 4,3', '4': '0,0 0,3 4,3|4,0 4,6', '5': '4,0 0,0 0,3 4,3 4,6 0,6',
    '6': '4,0 0,0 0,6 4,6 4,3 0,3', '7': '0,0 4,0 4,6', '8': '0,0 4,0 4,6 0,6 0,0|0,3 4,3',
    '9': '4,3 0,3 0,0 4,0 4,6 0,6',
    A: '0,6 0,2 2,0 4,2 4,6|0,3 4,3', B: '0,0 3,0 4,1 4,2 3,3 4,4 4,5 3,6 0,6 0,0|0,3 3,3',
    C: '4,0 0,0 0,6 4,6', D: '0,0 2,0 4,2 4,4 2,6 0,6 0,0', E: '4,0 0,0 0,6 4,6|0,3 3,3',
    F: '4,0 0,0 0,6|0,3 3,3', G: '4,1 4,0 0,0 0,6 4,6 4,3 2,3', H: '0,0 0,6|4,0 4,6|0,3 4,3',
    I: '0,0 4,0|2,0 2,6|0,6 4,6', J: '4,0 4,6 2,6 0,4', K: '0,0 0,6|4,0 0,3 4,6',
    L: '0,0 0,6 4,6', M: '0,6 0,0 2,2 4,0 4,6', N: '0,6 0,0 4,6 4,0', O: '0,0 4,0 4,6 0,6 0,0',
    P: '0,6 0,0 4,0 4,3 0,3', Q: '0,0 4,0 4,4 2,6 0,6 0,0|2,4 4,6', R: '0,6 0,0 4,0 4,3 0,3|1,3 4,6',
    S: '4,0 0,0 0,3 4,3 4,6 0,6', T: '0,0 4,0|2,0 2,6', U: '0,0 0,6 4,6 4,0', V: '0,0 2,6 4,0',
    W: '0,0 0,6 2,4 4,6 4,0', X: '0,0 4,6|4,0 0,6', Y: '0,0 2,3 4,0|2,3 2,6', Z: '0,0 4,0 0,6 4,6',
    '-': '1,3 3,3', '.': '2,5.4 2,6', '!': '2,0 2,4|2,5.4 2,6', '?': '0,1 0,0 4,0 4,3 2,3 2,4|2,5.4 2,6',
    ':': '2,1 2,1.6|2,4.4 2,5', '/': '0,6 4,0', '<': '4,0 0,3 4,6', '>': '0,0 4,3 0,6',
    '=': '0,2 4,2|0,4 4,4', '(': '3,0 1,2 1,4 3,6', ')': '1,0 3,2 3,4 1,6', '+': '2,1 2,5|0,3 4,3',
    "'": '2,0 2,2', ',': '2,5 1,7',
  };

  const GLYPHS = {};
  for (const ch in RAW) {
    GLYPHS[ch] = RAW[ch].split('|').map((stroke) => stroke.trim().split(' ').map((p) => p.split(',').map(Number)));
  }

  // Adds the text's strokes to the current path. Height h is in pixels. Returns the text width.
  function path(ctx, text, x, y, h) {
    const s = h / 6;
    const str = String(text).toUpperCase();
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]];
      if (!g) continue;
      const ox = x + i * 6.5 * s;
      for (const stroke of g) {
        ctx.moveTo(ox + stroke[0][0] * s, y + stroke[0][1] * s);
        for (let k = 1; k < stroke.length; k++) ctx.lineTo(ox + stroke[k][0] * s, y + stroke[k][1] * s);
      }
    }
    return width(text, h);
  }

  function width(text, h) {
    const s = h / 6;
    return Math.max(0, String(text).length * 6.5 * s - 2.5 * s);
  }

  // Draws text; align is 'left' (default), 'center' or 'right'.
  function draw(ctx, text, x, y, h, color, align) {
    const w = width(text, h);
    const sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.beginPath();
    path(ctx, text, sx, y, h);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.stroke();
  }

  window.VectorFont = { draw, width, path };
})();
