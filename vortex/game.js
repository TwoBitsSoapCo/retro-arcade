// Vortex game logic and drawing.
// Everything lives on a "web": a tube made of lanes. Each thing has a lane number and a depth z,
// where z = 0 is the near rim (where the player is) and z = 1 is the far end of the tube.
// The screen is a 600x800 logical space. main.js scales it to the window.
(function () {
  'use strict';
  const VX = window.VX;
  const VF = window.VectorFont;
  const Store = window.ArcadeStore;

  const W = 600;
  const H = 800;
  const CX = 300;
  const CY = 450;
  const RADIUS = 250;
  const TAU = Math.PI * 2;
  const NEAR_CLIP = -0.1; // how far past the rim (toward the viewer) we still draw during the warp
  const BULLET_SPEED = 0.04;
  const MAX_BULLETS = 8;
  const WARP_TICKS = 150;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const DIFFICULTY = {
    easy: { speed: 0.75, fire: 0.5, spawn: 1.3 },
    normal: { speed: 1.0, fire: 1.0, spawn: 1.0 },
    hard: { speed: 1.25, fire: 1.5, spawn: 0.8 },
  };
  // Keyboard "spinner": ticks before auto-repeat, then ticks between lane steps.
  const SPIN = { slow: { delay: 10, rate: 6 }, normal: { delay: 8, rate: 4 }, fast: { delay: 6, rate: 2 } };
  const POINTS = { flipper: 150, tanker: 100, spiker: 50, pulsar: 200, spike: 3 };
  // Starting on a later level earns a bonus once that level is cleared, as in the original.
  const START_BONUS = { 1: 0, 3: 6000, 5: 16000, 7: 32000, 9: 54000, 11: 74000, 13: 94000, 15: 114000, 17: 134000 };
  const COLORS = {
    player: '#ffe23d', flipper: '#ff2a2a', tanker: '#c040ff', spiker: '#30ff60', spike: '#30ff60',
    pulsar: '#22e0ff', bullet: '#ffffff', ebullet: '#ff7070', score: '#22e0ff',
  };
  const FUSE_COLORS = ['#ff3030', '#ffe23d', '#30ff60', '#3d9bff', '#ff40e0'];

  // Shapes in lane-local units: u runs across the lane, v runs down into the tube. 1 = one lane width.
  const CLAW = [[-0.5, 0], [-0.22, 0.32], [0, 0.16], [0.22, 0.32], [0.5, 0], [0.24, 0.1], [0, -0.02], [-0.24, 0.1]];
  const FLIPPER = [[-0.5, -0.14], [0.5, 0.14], [0.5, -0.14], [-0.5, 0.14]];
  const TANKER_OUT = [[-0.45, 0], [0, -0.32], [0.45, 0], [0, 0.32]];
  const TANKER_IN = [[-0.2, 0], [0, -0.14], [0.2, 0], [0, 0.14]];

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const lerp = (a, b, t) => a + (b - a) * t;

  class Game {
    constructor(sound) {
      this.sound = sound;
      this.settings = null;
      this.glow = true;
      this.hiscores = Store.loadScores('vortex');
      this.players = [];
      this.cur = 0;
      this.state = 'attract';
      this.t = 0;
      this.paused = false;
      this.diff = DIFFICULTY.normal;
      this.spin = SPIN.normal;
      this.web = VX.buildWeb(1, RADIUS);
      this.resetBoard();
    }

    get p() {
      return this.players[this.cur];
    }

    get inProgress() {
      return this.state !== 'attract' && this.state !== 'initials';
    }

    // ---------- game flow ----------

    start() {
      const s = this.settings;
      this.diff = DIFFICULTY[s.difficulty] || DIFFICULTY.normal;
      this.spin = SPIN[s.spin] || SPIN.normal;
      this.players = [];
      for (let i = 0; i < s.players; i++) this.players.push(this.newPlayer(i));
      this.cur = 0;
      this.bonusMsg = 0;
      this.toReady(true);
    }

    quit() {
      this.players = [];
      this.toAttract();
    }

    toAttract() {
      this.state = 'attract';
      this.t = 0;
      this.resetBoard();
    }

    newPlayer(id) {
      const s = this.settings;
      const p = {
        id, score: 0, lives: s.lives, level: s.startLevel, over: false,
        nextBonus: s.bonus > 0 ? s.bonus : Infinity, startBonus: START_BONUS[s.startLevel] || 0,
      };
      this.setupLevel(p);
      return p;
    }

    setupLevel(p) {
      p.web = VX.buildWeb(p.level, RADIUS);
      p.queue = this.levelPlan(p.level);
      p.spikes = new Array(p.web.lanes).fill(1); // spike tip depth per lane; 1 = no spike
      p.zapUses = 0;
    }

    // Which enemies come out of the tube this level. New types join as levels go up.
    levelPlan(level) {
      const count = Math.min(8 + level * 2, 44);
      const kinds = [['flipper', 1]];
      if (level >= 3) kinds.push(['tanker', level >= 5 ? 0.35 : 0.2]);
      if (level >= 4) kinds.push(['spiker', 0.3]);
      if (level >= 11) kinds.push(['fuseball', 0.25]);
      if (level >= 17) kinds.push(['pulsar', 0.3]);
      const total = kinds.reduce((s, k) => s + k[1], 0);
      const q = [];
      for (let i = 0; i < count; i++) {
        let pick = 'flipper';
        if (i >= 3) {
          let r = Math.random() * total;
          for (const [k, w] of kinds) {
            if ((r -= w) <= 0) {
              pick = k;
              break;
            }
          }
        }
        q.push(pick);
      }
      return q;
    }

    resetBoard() {
      this.enemies = [];
      this.bullets = [];
      this.ebullets = [];
      this.booms = [];
      this.cam = 0;
      this.zoom = 1;
      this.flash = 0;
      this.spawnTimer = 40;
      this.fireCd = 0;
      this.holdDir = 0;
      this.holdT = 0;
      this.lane = this.web.startLane;
    }

    toReady(newLevel) {
      this.web = this.p.web;
      this.resetBoard();
      this.state = 'ready';
      this.t = 0;
      this.zoom = 0.05;
      this.readyNewLevel = newLevel;
      if (newLevel) this.sound.levelStart();
    }

    nextLevel() {
      const p = this.p;
      this.bonusMsg = 0;
      if (p.startBonus) {
        p.score += p.startBonus;
        this.bonusMsg = p.startBonus;
        p.startBonus = 0;
        this.checkBonus();
      }
      p.level++;
      this.setupLevel(p);
      this.toReady(true);
    }

    switchPlayer() {
      if (this.players.length < 2) return false;
      const other = 1 - this.cur;
      if (this.players[other].over) return false;
      this.cur = other;
      return true;
    }

    afterGameOver() {
      const other = this.players.find((q) => !q.over);
      if (other) {
        this.cur = other.id;
        this.bonusMsg = 0;
        this.toReady(false);
        return;
      }
      this.initialsQueue = this.players.slice();
      this.nextInitials();
    }

    nextInitials() {
      let q;
      while ((q = this.initialsQueue.shift()) && !Store.qualifies(this.hiscores, q.score));
      if (!q) {
        this.toAttract();
        return;
      }
      this.entry = { player: q, letters: [0, 0, 0], pos: 0 };
      this.state = 'initials';
      this.t = 0;
    }

    // ---------- per-tick update ----------

    update(input) {
      const spin = input.spin ? input.spin() : 0;
      if (this.paused) return;
      this.t++;
      switch (this.state) {
        case 'attract':
          if (input.pressed('start')) this.start();
          break;
        case 'ready':
          this.zoom = Math.min(1, 0.05 + this.t / 45);
          if (this.t >= 75) {
            this.state = 'playing';
            this.t = 0;
            this.zoom = 1;
          }
          break;
        case 'playing':
          this.updatePlaying(input, spin);
          break;
        case 'warp':
          this.updateWarp(input, spin);
          break;
        case 'dying':
          this.updateDying();
          break;
        case 'gameover':
          if (this.t >= 180) this.afterGameOver();
          break;
        case 'initials':
          this.updateInitials(input, spin);
          break;
      }
      this.booms = this.booms.filter((b) => ++b.t < b.life);
      if (this.flash > 0) this.flash--;
    }

    updatePlaying(input, spin) {
      const p = this.p;
      this.controlPlayer(input, spin);
      this.updateBullets();
      this.spawnEnemies();
      this.updateEnemies();
      if (this.state !== 'playing') return;
      this.updateEnemyBullets();
      if (this.state !== 'playing') return;
      this.checkBonus();
      if (!p.queue.length && !this.enemies.length) this.startWarp();
    }

    controlPlayer(input, spin) {
      const dir = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
      if (dir) {
        if (dir !== this.holdDir) {
          this.holdDir = dir;
          this.holdT = 0;
          this.step(dir);
        } else if (++this.holdT >= this.spin.delay && (this.holdT - this.spin.delay) % this.spin.rate === 0) {
          this.step(dir);
        }
      } else {
        this.holdDir = 0;
      }
      for (let i = 0; i < Math.abs(spin); i++) this.step(Math.sign(spin));

      if (this.fireCd > 0) this.fireCd--;
      const wantFire = input.pressed('fire') || input.down('fire');
      if (wantFire && this.fireCd === 0 && this.bullets.length < MAX_BULLETS) {
        this.bullets.push({ lane: this.lane, z: this.cam });
        this.fireCd = 5;
        this.sound.fire();
      }
      if (input.pressed('zap')) this.superzap();
    }

    // dir is a screen direction (+1 = right at the starting lane), converted to a lane step.
    step(dir) {
      const L = this.web.lanes;
      let n = this.lane + dir * this.web.rightDir;
      if (this.web.closed) n = (n + L) % L;
      else if (n < 0 || n >= L) return;
      this.lane = n;
      this.sound.move();
    }

    // First use per level destroys everything on screen; the second destroys one random enemy.
    superzap() {
      const p = this.p;
      if (p.zapUses >= 2 || !this.enemies.length) return;
      p.zapUses++;
      if (p.zapUses === 1) {
        for (const e of this.enemies.slice()) this.killEnemy(e, true);
        this.ebullets = [];
        this.flash = 40;
      } else {
        this.killEnemy(this.enemies[randInt(0, this.enemies.length - 1)], true);
        this.flash = 10;
      }
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.sound.zap();
    }

    climb() {
      return (0.0028 + 0.00018 * Math.min(this.p.level, 40)) * this.diff.speed;
    }

    spawnEnemies() {
      const p = this.p;
      if (!p.queue.length) return;
      const cap = Math.min(4 + Math.floor(p.level / 2), 10);
      if (--this.spawnTimer > 0 || this.enemies.length >= cap) return;
      this.spawnTimer = Math.round(Math.max(20, 70 - p.level * 3) * this.diff.spawn);
      this.addEnemy(p.queue.shift(), randInt(0, this.web.lanes - 1), 1);
    }

    addEnemy(type, lane, z) {
      const e = {
        type, lane, z, move: null, grab: 0, t: randInt(0, 99), nextFlip: randInt(30, 120),
        fireCd: randInt(60, 200), phase: 'up', target: rand(0.2, 0.75), vz: 1, dead: false, pulsing: false,
      };
      this.enemies.push(e);
      return e;
    }

    updateEnemies() {
      const climb = this.climb();
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        e.t++;
        if (e.type === 'flipper' || e.type === 'pulsar') this.updateFlipper(e, climb);
        else if (e.type === 'tanker') this.updateTanker(e, climb);
        else if (e.type === 'spiker') this.updateSpiker(e, climb);
        else if (e.type === 'fuseball') this.updateFuseball(e, climb);
        if (this.state !== 'playing') return;
      }
      this.enemies = this.enemies.filter((e) => !e.dead);
    }

    // Start a flip (flippers) or hop (fuseballs) to the neighboring lane in index direction d.
    startMove(e, d, dur) {
      const L = this.web.lanes;
      let to = e.lane + d;
      if (this.web.closed) {
        to = (to + L) % L;
      } else if (to < 0 || to >= L) {
        d = -d;
        to = e.lane + d;
        if (to < 0 || to >= L) return;
      }
      e.move = { from: e.lane, to, d, t: 0, dur };
    }

    advanceMove(e) {
      if (++e.move.t >= e.move.dur) {
        e.lane = e.move.to;
        e.move = null;
      }
    }

    // Lane-index direction from a lane toward the player, taking the short way round.
    dirToward(lane) {
      const L = this.web.lanes;
      if (this.web.closed) return (this.lane - lane + L) % L <= L / 2 ? 1 : -1;
      return this.lane > lane ? 1 : -1;
    }

    updateFlipper(e, climb) {
      const pulsar = e.type === 'pulsar';
      if (pulsar) {
        const phase = e.t % 100;
        e.pulsing = phase < 30;
        if (phase === 0 && e.z < 0.6) this.sound.pulse();
        // A pulsing pulsar electrifies its lane.
        if (e.pulsing && !e.move && e.z < 0.5 && e.lane === this.lane) {
          this.killPlayer();
          return;
        }
      }
      if (e.move) {
        this.advanceMove(e);
        return;
      }
      if (e.z > 0) {
        e.z = Math.max(0, e.z - climb * (pulsar ? 0.7 : 1));
        if (--e.nextFlip <= 0) {
          this.startMove(e, Math.random() < 0.5 ? -1 : 1, 10);
          e.nextFlip = randInt(40, 140);
        }
        this.maybeFire(e);
        return;
      }
      // On the rim: crawl toward the player. Landing in the player's lane starts a grab,
      // and you have a split second to shoot it before it drags you away.
      if (e.lane === this.lane) {
        if (e.grab === 0) this.sound.grab();
        if (++e.grab > 8) this.killPlayer();
      } else {
        e.grab = 0;
        if (--e.nextFlip <= 0) {
          this.startMove(e, this.dirToward(e.lane), 10);
          e.nextFlip = Math.round(16 / this.diff.speed);
        }
      }
    }

    updateTanker(e, climb) {
      e.z = Math.max(0, e.z - climb * 0.8);
      this.maybeFire(e);
      if (e.z === 0) this.splitTanker(e);
    }

    // A tanker breaks into two flippers that flip off to either side.
    splitTanker(e) {
      e.dead = true;
      for (const d of [-1, 1]) {
        const f = this.addEnemy('flipper', e.lane, e.z);
        f.nextFlip = randInt(20, 60);
        this.startMove(f, d, 10);
      }
    }

    // Spikers climb part way up, leaving a spike behind them, then retreat and come back as flippers.
    updateSpiker(e, climb) {
      const sp = this.p.spikes;
      if (e.phase === 'up') {
        e.z = Math.max(e.target, e.z - climb * 1.1);
        sp[e.lane] = Math.min(sp[e.lane], e.z);
        if (e.z <= e.target) e.phase = 'down';
      } else {
        e.z += climb * 1.6;
        if (e.z >= 1) {
          e.z = 1;
          e.type = 'flipper';
          e.nextFlip = randInt(10, 60);
        }
      }
    }

    // Fuseballs wander up and down unpredictably and hop between lanes. Touching one is deadly.
    updateFuseball(e, climb) {
      if (e.move) {
        this.advanceMove(e);
        return;
      }
      if (e.z > 0) {
        if (Math.random() < 1 / 50) e.vz = rand(-0.6, 1.8);
        e.z = Math.min(1, Math.max(0, e.z - climb * e.vz));
        if (Math.random() < 1 / 100) this.startMove(e, Math.random() < 0.5 ? -1 : 1, 12);
        return;
      }
      if (e.lane === this.lane) {
        this.killPlayer();
        return;
      }
      if (--e.nextFlip <= 0) {
        this.startMove(e, this.dirToward(e.lane), 12);
        e.nextFlip = 20;
      }
    }

    maybeFire(e) {
      if (e.z < 0.15 || e.z > 0.95) return;
      if (--e.fireCd > 0) return;
      // Enemies shoot more often as the levels go up.
      const level = Math.min(this.p.level, 40);
      e.fireCd = randInt(Math.max(30, 80 - level * 2), Math.max(80, 220 - level * 5));
      if (this.ebullets.length >= 2 + Math.floor(level / 5)) return;
      if (Math.random() < Math.min(0.9, 0.35 + level * 0.03) * this.diff.fire) {
        this.ebullets.push({ lane: e.lane, z: e.z, spd: this.climb() * 2.5 + 0.005, dead: false });
        this.sound.enemyFire();
      }
    }

    updateBullets() {
      const p = this.p;
      for (const b of this.bullets) {
        const z0 = b.z;
        b.z += BULLET_SPEED;
        if (b.z > 1) {
          b.dead = true;
          continue;
        }
        for (const eb of this.ebullets) {
          if (!eb.dead && eb.lane === b.lane && eb.z >= z0 - 0.03 && eb.z <= b.z + 0.03) {
            eb.dead = true;
            b.dead = true;
            break;
          }
        }
        if (b.dead) continue;
        for (const e of this.enemies) {
          if (e.dead || e.move || e.lane !== b.lane) continue;
          if (e.z >= z0 - 0.035 && e.z <= b.z + 0.035) {
            this.killEnemy(e, false);
            b.dead = true;
            break;
          }
        }
        if (b.dead) continue;
        // Shots wear spikes down a little at a time.
        const tip = p.spikes[b.lane];
        if (tip < 1 && b.z >= tip) {
          p.spikes[b.lane] = tip + 0.07 >= 0.97 ? 1 : tip + 0.07;
          p.score += POINTS.spike;
          b.dead = true;
          this.sound.spikeHit();
        }
      }
      this.bullets = this.bullets.filter((b) => !b.dead);
      this.ebullets = this.ebullets.filter((b) => !b.dead);
      this.enemies = this.enemies.filter((e) => !e.dead);
    }

    killEnemy(e, byZap) {
      if (e.dead) return;
      e.dead = true;
      let pts = POINTS[e.type] || 0;
      if (e.type === 'fuseball') pts = e.z > 0.66 ? 750 : e.z > 0.33 ? 500 : 250;
      this.p.score += pts;
      this.boom(e.lane, e.z, e.type === 'fuseball' ? '#ffffff' : COLORS[e.type], 26, 20);
      this.sound.enemyHit();
      if (e.type === 'tanker' && !byZap) this.splitTanker(e);
    }

    updateEnemyBullets() {
      for (const b of this.ebullets) {
        b.z -= b.spd;
        if (b.z <= this.cam) {
          b.dead = true;
          if (b.lane === this.lane) {
            this.killPlayer();
            return;
          }
        }
      }
      this.ebullets = this.ebullets.filter((b) => !b.dead);
    }

    checkBonus() {
      const p = this.p;
      while (p.score >= p.nextBonus) {
        p.lives++;
        p.nextBonus += this.settings.bonus;
        this.sound.extraLife();
      }
    }

    // Level cleared: fly down the tube to the next one. Don't hit any spikes on the way!
    startWarp() {
      this.state = 'warp';
      this.t = 0;
      this.ebullets = [];
      this.spikeWarning = this.p.spikes.some((s) => s < 1);
      this.sound.warp();
    }

    updateWarp(input, spin) {
      this.controlPlayer(input, spin);
      this.updateBullets();
      const u = Math.min(1, this.t / WARP_TICKS);
      this.cam = u * u * 1.08;
      const tip = this.p.spikes[this.lane];
      if (tip < 1 && this.cam >= tip) {
        this.killPlayer();
        return;
      }
      this.checkBonus();
      if (this.t >= WARP_TICKS) this.nextLevel();
    }

    killPlayer() {
      if (this.state === 'dying') return;
      this.wasWarping = this.state === 'warp';
      this.state = 'dying';
      this.t = 0;
      this.boom(this.lane, this.cam, COLORS.player, 90, 90);
      this.bullets = [];
      this.ebullets = [];
      this.sound.playerDie();
    }

    updateDying() {
      if (this.t < 130) return;
      const p = this.p;
      // Enemies still on the board go back into the tube for the retry.
      for (const e of this.enemies) p.queue.unshift(e.type);
      p.lives--;
      if (this.wasWarping) {
        // The level was already cleared, so the next life starts on the next level.
        p.level++;
        this.setupLevel(p);
      }
      if (p.lives <= 0) {
        p.lives = 0;
        p.over = true;
        this.state = 'gameover';
        this.t = 0;
        return;
      }
      this.bonusMsg = 0;
      const switched = this.switchPlayer();
      this.toReady(this.wasWarping && !switched);
    }

    updateInitials(input, spin) {
      const e = this.entry;
      const typed = input.typed();
      // Spinning (touch strip or mouse) also changes the current letter.
      if (spin && e.pos < 3) e.letters[e.pos] = (((e.letters[e.pos] + spin) % 26) + 26) % 26;
      if (typed.length) {
        for (const ch of typed) if (e.pos < 3) e.letters[e.pos++] = LETTERS.indexOf(ch);
      } else {
        if (input.pressed('up')) e.letters[e.pos] = (e.letters[e.pos] + 1) % 26;
        if (input.pressed('down')) e.letters[e.pos] = (e.letters[e.pos] + 25) % 26;
        if (input.pressed('left') && e.pos > 0) e.pos--;
        if (input.pressed('right') || input.pressed('select')) e.pos++;
      }
      if (e.pos >= 3) {
        const initials = e.letters.map((i) => LETTERS[i]).join('');
        this.hiscores = Store.addScore('vortex', this.hiscores, initials, e.player.score);
        this.nextInitials();
      }
    }

    boom(lane, z, color, size, life) {
      this.booms.push({ lane, z, color, size, life, t: 0 });
    }

    // ---------- 3D projection ----------

    // Project a rim-relative point (x, y in pixels) at depth z onto the screen.
    proj(x, y, z) {
      const w = this.web;
      const p = 1 / (1 + (z - this.cam) * w.K);
      return [CX + x * p + w.vx * (1 - p), CY + y * p + w.vy * (1 - p)];
    }

    rimPt(i, z) {
      const r = this.web.rim[i % this.web.rim.length];
      return this.proj(r[0], r[1], z);
    }

    laneCenter(lane, z) {
      const a = this.rimPt(lane, z);
      const b = this.rimPt(lane + 1, z);
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }

    // Screen-space frame for drawing a shape sitting in a lane at depth z.
    laneFrame(lane, z) {
      const a = this.rimPt(lane, z);
      const b = this.rimPt(lane + 1, z);
      const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const deeper = z < 0.95;
      const c2 = this.laneCenter(lane, deeper ? z + 0.05 : z - 0.05);
      let nx = (c2[0] - c[0]) * (deeper ? 1 : -1);
      let ny = (c2[1] - c[1]) * (deeper ? 1 : -1);
      let ux = b[0] - a[0];
      let uy = b[1] - a[1];
      const w = Math.hypot(ux, uy) || 1;
      ux /= w;
      uy /= w;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) {
        nx = -uy;
        ny = ux;
      } else {
        nx /= nl;
        ny /= nl;
      }
      return { c, ux, uy, nx, ny, w };
    }

    shapePath(ctx, f, pts, closed, scale) {
      const s = f.w * (scale || 1);
      pts.forEach(([u, v], i) => {
        const x = f.c[0] + (f.ux * u + f.nx * v) * s;
        const y = f.c[1] + (f.uy * u + f.ny * v) * s;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      if (closed) ctx.closePath();
    }

    stroke(ctx, color) {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.stroke();
    }

    // ---------- drawing ----------

    render(ctx) {
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowBlur = this.glow ? 12 : 0;
      if (this.state === 'attract') this.drawAttract(ctx);
      else if (this.state === 'initials') this.drawInitials(ctx);
      else {
        this.drawWorld(ctx);
        this.drawHud(ctx);
      }
      if (this.paused) VF.draw(ctx, 'PAUSED', W / 2, 380, 32, '#ffffff', 'center');
      ctx.restore();
    }

    drawWeb(ctx, color) {
      const w = this.web;
      const n = w.rim.length;
      const zNear = Math.max(0, this.cam + NEAR_CLIP);
      const ring = (z) => {
        for (let i = 0; i < n; i++) {
          const p = this.rimPt(i, z);
          if (i) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
        }
        if (w.closed) ctx.closePath();
      };
      ctx.beginPath();
      if (this.cam + NEAR_CLIP <= 0) ring(0);
      ring(1);
      for (let i = 0; i < n; i++) {
        const a = this.rimPt(i, zNear);
        const b = this.rimPt(i, 1);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      this.stroke(ctx, color);
      return zNear;
    }

    drawWorld(ctx) {
      const w = this.web;
      const p = this.p;
      ctx.save();
      if (this.zoom < 1) {
        // The web flies in from the distance at the start of each life.
        const fx = CX + w.vx * 0.84;
        const fy = CY + w.vy * 0.84;
        ctx.translate(fx, fy);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-fx, -fy);
      }

      const color = this.flash > 0 && (this.flash >> 2) & 1 ? '#ffffff' : w.color;
      const zNear = this.drawWeb(ctx, color);
      const alive = this.state !== 'dying' && this.state !== 'gameover';

      // The player's lane is outlined in yellow.
      if (alive) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const i of [this.lane, this.lane + 1]) {
          const a = this.rimPt(i, zNear);
          const b = this.rimPt(i, 1);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
        this.stroke(ctx, COLORS.player);
        ctx.restore();
      }

      // Spikes
      ctx.beginPath();
      p.spikes.forEach((tip, lane) => {
        if (tip >= 1) return;
        const a = this.laneCenter(lane, Math.max(tip, zNear));
        const b = this.laneCenter(lane, 1);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        if (tip >= zNear) {
          const f = this.laneFrame(lane, tip);
          this.shapePath(ctx, f, [[-0.12, 0], [0.12, 0]], false);
        }
      });
      this.stroke(ctx, COLORS.spike);

      for (const e of this.enemies) this.drawEnemy(ctx, e, zNear);

      // Player shots
      ctx.beginPath();
      for (const b of this.bullets) {
        if (b.z < zNear) continue;
        const f = this.laneFrame(b.lane, b.z);
        this.shapePath(ctx, f, [[0, -0.12], [0.12, 0], [0, 0.12], [-0.12, 0]], true);
      }
      this.stroke(ctx, COLORS.bullet);

      // Enemy shots
      ctx.beginPath();
      for (const b of this.ebullets) {
        const f = this.laneFrame(b.lane, b.z);
        const r = 0.11;
        const a = this.t * 0.3;
        for (let k = 0; k < 2; k++) {
          const ang = a + (k * Math.PI) / 2;
          this.shapePath(ctx, f, [[Math.cos(ang) * r, Math.sin(ang) * r], [-Math.cos(ang) * r, -Math.sin(ang) * r]], false);
        }
      }
      this.stroke(ctx, COLORS.ebullet);

      if (alive) {
        ctx.beginPath();
        this.shapePath(ctx, this.laneFrame(this.lane, this.cam), CLAW, true);
        this.stroke(ctx, COLORS.player);
      }

      for (const b of this.booms) this.drawBoom(ctx, b);
      ctx.restore();
    }

    drawEnemy(ctx, e, zNear) {
      if (e.z < zNear) return;
      if (e.move && e.type !== 'fuseball') {
        this.drawFlipping(ctx, e);
        return;
      }
      let f;
      if (e.move) {
        // A hopping fuseball slides between the two lanes.
        const a = this.laneFrame(e.move.from, e.z);
        const b = this.laneFrame(e.move.to, e.z);
        const t = e.move.t / e.move.dur;
        f = Object.assign({}, a, { c: [lerp(a.c[0], b.c[0], t), lerp(a.c[1], b.c[1], t)], w: lerp(a.w, b.w, t) });
      } else {
        f = this.laneFrame(e.lane, e.z);
      }
      ctx.beginPath();
      switch (e.type) {
        case 'flipper':
          this.shapePath(ctx, f, FLIPPER, true);
          this.stroke(ctx, COLORS.flipper);
          break;
        case 'tanker':
          this.shapePath(ctx, f, TANKER_OUT, true);
          this.shapePath(ctx, f, TANKER_IN, true);
          this.stroke(ctx, COLORS.tanker);
          break;
        case 'spiker': {
          const pts = [];
          for (let k = 0; k <= 18; k++) {
            const ang = k * 0.6 + e.t * 0.25;
            const r = 0.04 + k * 0.022;
            pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
          }
          this.shapePath(ctx, f, pts, false);
          this.stroke(ctx, COLORS.spiker);
          break;
        }
        case 'fuseball':
          for (let j = 0; j < 5; j++) {
            ctx.beginPath();
            const base = (j * TAU) / 5 + e.t * 0.1;
            const pts = [[0, 0]];
            for (let k = 1; k <= 3; k++) {
              const ang = base + Math.sin(e.t * 0.7 + j * 3 + k) * 0.5;
              const r = k * 0.15;
              pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
            }
            this.shapePath(ctx, f, pts, false);
            this.stroke(ctx, FUSE_COLORS[j]);
          }
          break;
        case 'pulsar': {
          const amp = e.pulsing ? 0.3 : 0.08;
          const pts = [];
          for (let k = 0; k <= 6; k++) pts.push([-0.5 + k / 6, (k % 2 ? 1 : -1) * amp]);
          this.shapePath(ctx, f, pts, false);
          const color = e.pulsing ? '#ffffff' : COLORS.pulsar;
          if (e.pulsing && e.z < 0.5) {
            // electrified lane edges
            for (const i of [e.lane, e.lane + 1]) {
              const a = this.rimPt(i, zNear);
              const b = this.rimPt(i, e.z);
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
            }
          }
          this.stroke(ctx, color);
          break;
        }
      }
    }

    // Flippers (and pulsars) tumble end over end across the shared lane edge.
    drawFlipping(ctx, e) {
      const m = e.move;
      const t = m.t / m.dur;
      const pivot = this.rimPt(m.d > 0 ? m.from + 1 : m.from, e.z);
      const A = this.rimPt(m.d > 0 ? m.from : m.from + 1, e.z);
      const C = this.rimPt(m.d > 0 ? m.to + 1 : m.to, e.z);
      const a0 = Math.atan2(A[1] - pivot[1], A[0] - pivot[0]);
      const a1 = Math.atan2(C[1] - pivot[1], C[0] - pivot[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      d = d > 0 ? d - TAU : d + TAU; // the long way round, over the outside of the tube
      const ang = a0 + d * t;
      const len = lerp(Math.hypot(A[0] - pivot[0], A[1] - pivot[1]), Math.hypot(C[0] - pivot[0], C[1] - pivot[1]), t);
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const f = { c: [pivot[0] + (ux * len) / 2, pivot[1] + (uy * len) / 2], ux, uy, nx: -uy, ny: ux, w: len };
      ctx.beginPath();
      this.shapePath(ctx, f, FLIPPER, true);
      this.stroke(ctx, e.type === 'pulsar' ? COLORS.pulsar : COLORS.flipper);
    }

    drawBoom(ctx, b) {
      if (b.z - this.cam < NEAR_CLIP) return;
      const f = this.laneFrame(b.lane, b.z);
      const k = b.t / b.life;
      const big = b.life > 40;
      const r = b.size * (0.25 + k) * (big ? 1 : Math.max(0.4, f.w / 60));
      ctx.save();
      ctx.globalAlpha = 1 - k;
      const rays = big ? 16 : 10;
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * TAU + b.t * 0.05;
        ctx.beginPath();
        ctx.moveTo(f.c[0] + Math.cos(ang) * r * 0.35, f.c[1] + Math.sin(ang) * r * 0.35);
        ctx.lineTo(f.c[0] + Math.cos(ang) * r, f.c[1] + Math.sin(ang) * r);
        this.stroke(ctx, big ? FUSE_COLORS[(i + (b.t >> 2)) % FUSE_COLORS.length] : b.color);
      }
      ctx.restore();
    }

    drawClawIcon(ctx, x, y, size) {
      ctx.beginPath();
      this.shapePath(ctx, { c: [x, y], ux: 1, uy: 0, nx: 0, ny: -1, w: size }, CLAW, true);
      this.stroke(ctx, COLORS.player);
    }

    drawHud(ctx) {
      const p = this.p;
      const blink = this.state === 'ready' && this.players.length > 1 && (this.t >> 3) & 1;
      this.players.forEach((q, i) => {
        const right = i === 1;
        const x = right ? W - 24 : 24;
        if (!(blink && i === this.cur)) VF.draw(ctx, String(q.score), x, 22, 28, COLORS.score, right ? 'right' : 'left');
        const spare = Math.min(Math.max(q.lives - 1, 0), 6);
        for (let k = 0; k < spare; k++) this.drawClawIcon(ctx, right ? x - 12 - k * 28 : x + 12 + k * 28, 80, 22);
      });
      const best = this.hiscores.length ? this.hiscores[0].score : 0;
      const hi = Math.max(best, ...this.players.map((q) => q.score));
      VF.draw(ctx, String(hi), W / 2, 22, 16, '#ff6060', 'center');
      VF.draw(ctx, String(p.level), W / 2, 48, 22, this.web.color, 'center');

      if (this.state === 'ready') {
        if (this.players.length > 1) VF.draw(ctx, 'PLAYER ' + (this.cur + 1), W / 2, 300, 26, COLORS.player, 'center');
        VF.draw(ctx, 'LEVEL ' + p.level, W / 2, 350, 26, '#ffffff', 'center');
        if (this.bonusMsg) VF.draw(ctx, 'BONUS ' + this.bonusMsg, W / 2, 400, 20, COLORS.score, 'center');
        if (this.readyNewLevel && this.t > 20) VF.draw(ctx, 'SUPERZAPPER RECHARGE', W / 2, 440, 16, '#30ff60', 'center');
      }
      if (this.state === 'warp' && this.spikeWarning && this.t < 100) {
        VF.draw(ctx, 'AVOID SPIKES', W / 2, 360, 28, '#30ff60', 'center');
      }
      if (this.state === 'gameover') {
        VF.draw(ctx, 'GAME OVER', W / 2, 360, 36, '#ff2a2a', 'center');
        if (this.players.length > 1) VF.draw(ctx, 'PLAYER ' + (this.cur + 1), W / 2, 420, 22, COLORS.player, 'center');
      }
    }

    drawAttract(ctx) {
      const page = Math.floor(this.t / 600) % 2;
      if (page === 0) {
        // Show off a different web each time round, slowly spinning.
        const keep = this.web;
        this.web = VX.buildWeb(1 + (Math.floor(this.t / 1200) % VX.WEB_COUNT), RADIUS * 0.9, this.t * 0.004);
        this.cam = 0;
        this.drawWeb(ctx, this.web.color);
        this.web = keep;
        ctx.lineWidth = 3;
        VF.draw(ctx, 'VORTEX', W / 2, 70, 72, COLORS.player, 'center');
        ctx.lineWidth = 2;
        VF.draw(ctx, 'A TRIBUTE TO THE 1981 CLASSIC', W / 2, 164, 12, '#9a9ab8', 'center');
      } else {
        VF.draw(ctx, 'HIGH SCORES', W / 2, 140, 30, '#ff2a2a', 'center');
        if (!this.hiscores.length) VF.draw(ctx, 'NO SCORES YET', W / 2, 300, 20, '#ffffff', 'center');
        this.hiscores.forEach((s, i) => {
          const y = 210 + i * 42;
          const color = i % 2 ? COLORS.score : COLORS.player;
          VF.draw(ctx, String(i + 1) + '.', 150, y, 20, color, 'right');
          VF.draw(ctx, s.initials, 190, y, 20, color);
          VF.draw(ctx, String(s.score), 450, y, 20, color, 'right');
        });
      }
      if ((this.t >> 5) & 1) VF.draw(ctx, this.touch ? 'TAP FIRE TO PLAY' : 'PRESS ENTER TO PLAY', W / 2, 712, 20, '#ffffff', 'center');
      VF.draw(ctx, this.touch ? 'SETTINGS BUTTON - MENU' : 'ESC - SETTINGS', W / 2, 752, 14, '#9a9ab8', 'center');
    }

    drawInitials(ctx) {
      const e = this.entry;
      VF.draw(ctx, 'NEW HIGH SCORE', W / 2, 160, 32, '#ff2a2a', 'center');
      if (this.players.length > 1) VF.draw(ctx, 'PLAYER ' + (e.player.id + 1), W / 2, 220, 22, COLORS.player, 'center');
      VF.draw(ctx, String(e.player.score), W / 2, 260, 28, COLORS.score, 'center');
      VF.draw(ctx, 'ENTER YOUR INITIALS', W / 2, 340, 18, '#ffffff', 'center');
      const str = e.letters.map((i) => LETTERS[i]).join('');
      ctx.lineWidth = 3;
      VF.draw(ctx, str, W / 2, 390, 60, COLORS.player, 'center');
      ctx.lineWidth = 2;
      if ((this.t >> 4) & 1 && e.pos < 3) {
        const x0 = W / 2 - VF.width(str, 60) / 2 + e.pos * 65;
        ctx.beginPath();
        ctx.moveTo(x0, 470);
        ctx.lineTo(x0 + 40, 470);
        this.stroke(ctx, COLORS.player);
      }
      VF.draw(ctx, this.touch ? 'SLIDE TO CHANGE LETTER' : 'TYPE OR UP/DOWN', W / 2, 540, 16, '#9a9ab8', 'center');
      VF.draw(ctx, this.touch ? 'FIRE = NEXT' : 'SPACE = NEXT', W / 2, 570, 16, '#9a9ab8', 'center');
    }
  }

  VX.Game = Game;
  VX.SCREEN = { W, H };
})();
