// The 16 tube shapes ("webs") Vortex cycles through, modeled on Tempest's level order.
// Each web is 16 rim points. Closed webs wrap around (16 lanes). Open webs have 15 lanes and two ends.
(function () {
  'use strict';
  const VX = (window.VX = window.VX || {});
  const N = 16;
  const TAU = Math.PI * 2;

  // 16 points around a center, radius given by f(angle). Half-step offset puts a lane at the bottom.
  const polar = (f) =>
    Array.from({ length: N }, (_, i) => {
      const a = -Math.PI / 2 + ((i + 0.5) / N) * TAU;
      const r = f(a, i);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });

  // Walk a polygon outline, splitting edge k into counts[k] equal segments.
  function outline(verts, counts, closed) {
    const pts = [];
    const edges = closed ? verts.length : verts.length - 1;
    for (let k = 0; k < edges; k++) {
      const a = verts[k];
      const b = verts[(k + 1) % verts.length];
      for (let s = 0; s < counts[k]; s++) {
        const t = s / counts[k];
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (!closed) pts.push(verts[verts.length - 1]);
    return pts;
  }

  const along = (f) => Array.from({ length: N }, (_, i) => { const x = -1 + (2 * i) / (N - 1); return [x, f(x)]; });
  const tri = (x) => 1 - Math.abs(2 * (((x + 1) % 1 + 1) % 1) - 1); // 0 at whole numbers, 1 halfway between

  const a = 0.4;
  const SHAPES = [
    { name: 'circle', closed: true, pts: polar(() => 1) },
    { name: 'square', closed: true, pts: outline([[-1, -1], [1, -1], [1, 1], [-1, 1]], [4, 4, 4, 4], true) },
    {
      name: 'plus', closed: true,
      pts: outline([[-a, -1], [a, -1], [a, -a], [1, -a], [1, a], [a, a], [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a]],
        [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1], true),
    },
    {
      name: 'bowtie', closed: true,
      pts: [[-1, -0.8], [-0.5, -0.55], [0, -0.3], [0.5, -0.55], [1, -0.8], [1, -0.4], [1, 0], [1, 0.4],
        [1, 0.8], [0.5, 0.55], [0, 0.3], [-0.5, 0.55], [-1, 0.8], [-1, 0.4], [-1, 0], [-1, -0.4]],
    },
    { name: 'cross', closed: true, pts: polar((ang) => 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(2 * ang)), 1.5)) },
    { name: 'triangle', closed: true, pts: outline([[0, -1], [1, 0.8], [-1, 0.8]], [5, 6, 5], true) },
    { name: 'clover', closed: true, pts: polar((ang) => 0.5 + 0.5 * Math.abs(Math.sin(2 * ang))) },
    { name: 'v', closed: false, pts: along((x) => 0.9 - 1.6 * Math.abs(x)) },
    {
      name: 'steps', closed: false,
      pts: (() => {
        const p = [[-1, -0.8]];
        let x = -1;
        let y = -0.8;
        for (let i = 0; i < 15; i++) {
          if (i % 2 === 0) x += 2 / 8;
          else y += 1.6 / 7;
          p.push([x, y]);
        }
        return p;
      })(),
    },
    {
      name: 'u', closed: false,
      pts: [[-1, -1], [-1, -0.73], [-1, -0.47]]
        .concat(Array.from({ length: 10 }, (_, k) => { const t = Math.PI - (k * Math.PI) / 9; return [Math.cos(t), -0.2 + 0.9 * Math.sin(t)]; }))
        .concat([[1, -0.47], [1, -0.73], [1, -1]]),
    },
    { name: 'flat', closed: false, pts: along(() => 0.5) },
    {
      name: 'heart', closed: true,
      pts: Array.from({ length: N }, (_, i) => {
        const t = (i / N) * TAU;
        return [16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
      }),
    },
    { name: 'star', closed: true, pts: polar((ang, i) => (i % 2 ? 0.5 : 1)) },
    { name: 'w', closed: false, pts: along((x) => -0.6 + 1.4 * tri(x)) },
    { name: 'm', closed: false, pts: along((x) => 0.8 - 1.4 * tri(x)) },
    {
      name: 'infinity', closed: true,
      pts: Array.from({ length: N }, (_, i) => {
        const t = ((i + 0.5) / N) * TAU;
        const d = 1 + Math.sin(t) * Math.sin(t);
        return [Math.cos(t) / d, (1.6 * Math.sin(t) * Math.cos(t)) / d];
      }),
    },
  ];

  // Web colors change every 16 levels, as in Tempest.
  const COLORS = ['#2f6bff', '#ff2a2a', '#ffe23d', '#22e0ff', '#a040ff', '#30ff60'];

  // Fit points into a box centered on 0, keeping proportions, longest side = 2 units.
  function normalize(pts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const s = 2 / Math.max(maxX - minX, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
  }

  // radius: rim size in screen pixels. rotation (radians) is only used by the title screen.
  VX.buildWeb = function (level, radius, rotation) {
    const def = SHAPES[(level - 1) % SHAPES.length];
    let pts = normalize(def.pts);
    if (rotation) {
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      pts = pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    }
    const far = def.closed ? 0.16 : 0.24;
    const rim = pts.map(([x, y]) => [x * radius, y * radius]);
    const lanes = def.closed ? N : N - 1;

    // Player starts in the lowest lane; "right" is whichever lane direction moves right on screen there.
    const laneY = (i) => (rim[i][1] + rim[(i + 1) % N][1]) / 2;
    let best = -Infinity;
    for (let i = 0; i < lanes; i++) best = Math.max(best, laneY(i));
    const lowest = [];
    for (let i = 0; i < lanes; i++) if (laneY(i) > best - 1) lowest.push(i);
    const start = lowest[Math.floor((lowest.length - 1) / 2)]; // ties (flat webs): take the middle one
    const nx = (i) => (rim[i % N][0] + rim[(i + 1) % N][0]) / 2;
    let rightDir = 1;
    if (def.closed || start + 1 < lanes) rightDir = nx(start + 1) > nx(start) ? 1 : -1;
    else rightDir = nx(start - 1) < nx(start) ? 1 : -1;

    return {
      name: def.name,
      closed: def.closed,
      rim,
      lanes,
      far,
      K: 1 / far - 1, // perspective strength: depth 1 shrinks to `far` size
      vx: 0,
      vy: (def.closed ? -0.12 : -0.8) * radius, // where the far end sits relative to the rim center
      color: COLORS[Math.floor((level - 1) / SHAPES.length) % COLORS.length],
      startLane: start,
      rightDir,
    };
  };
  VX.WEB_COUNT = SHAPES.length;
})();
