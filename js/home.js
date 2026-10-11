// Animated previews on the home page game cards.
(function () {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Star Invaders preview: a small marching formation ---
  const CRAB = [
    ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
    ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'],
  ];
  const inv = document.getElementById('previewInvaders');
  const ic = inv.getContext('2d');

  function drawCrab(frame, x, y, s, color) {
    ic.fillStyle = color;
    CRAB[frame].forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ic.fillRect(x + c * s, y + r * s, s, s);
    });
  }

  function drawInvaders(t) {
    ic.fillStyle = '#000';
    ic.fillRect(0, 0, 320, 240);
    const step = Math.floor(t / 500);
    const frame = step & 1;
    const offset = ((step % 16) < 8 ? step % 8 : 8 - (step % 8)) * 4;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        drawCrab(frame, 40 + c * 42 + offset, 40 + r * 34, 3, '#fff');
      }
    }
    // cannon and shields
    ic.fillStyle = '#39ff6a';
    [50, 130, 210].forEach((x) => ic.fillRect(x, 170, 50, 20));
    ic.fillStyle = '#000';
    [50, 130, 210].forEach((x) => ic.fillRect(x + 14, 182, 22, 8));
    ic.fillStyle = '#39ff6a';
    const cx = 150 + Math.sin(t / 900) * 90;
    ic.fillRect(cx, 214, 26, 10);
    ic.fillRect(cx + 11, 206, 4, 8);
    ic.fillRect(0, 232, 320, 2);
  }

  // --- Vortex preview: a glowing vector tube viewed from above ---
  const vor = document.getElementById('previewVortex');
  const vc = vor.getContext('2d');

  function drawVortex(t) {
    vc.fillStyle = '#000';
    vc.fillRect(0, 0, 320, 240);
    const cx = 160;
    const cy = 120;
    const n = 16;
    const rot = t / 4000;
    const outer = [];
    const inner = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      outer.push([cx + Math.cos(a) * 110, cy + Math.sin(a) * 100]);
      inner.push([cx + Math.cos(a) * 22, cy + Math.sin(a) * 20]);
    }
    vc.lineWidth = 2;
    vc.strokeStyle = '#3d7bff';
    vc.shadowColor = '#3d7bff';
    vc.shadowBlur = 10;
    vc.beginPath();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      vc.moveTo(outer[i][0], outer[i][1]);
      vc.lineTo(outer[j][0], outer[j][1]);
      vc.moveTo(inner[i][0], inner[i][1]);
      vc.lineTo(inner[j][0], inner[j][1]);
      vc.moveTo(outer[i][0], outer[i][1]);
      vc.lineTo(inner[i][0], inner[i][1]);
    }
    vc.stroke();
    // the player's claw on the rim
    const k = Math.floor((t / 600) % n);
    const a = outer[k];
    const b = outer[(k + 1) % n];
    vc.strokeStyle = '#ffe23d';
    vc.shadowColor = '#ffe23d';
    vc.beginPath();
    vc.moveTo(a[0], a[1]);
    vc.lineTo((a[0] + b[0]) / 2 + (cx - (a[0] + b[0]) / 2) * 0.12, (a[1] + b[1]) / 2 + (cy - (a[1] + b[1]) / 2) * 0.12);
    vc.lineTo(b[0], b[1]);
    vc.stroke();
    vc.shadowBlur = 0;
  }

  function loop(t) {
    drawInvaders(t);
    drawVortex(t);
    if (!reduceMotion) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
