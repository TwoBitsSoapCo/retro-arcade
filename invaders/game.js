// Star Invaders game logic and drawing.
// The playfield is 224x256 pixels, the same resolution as the 1978 original. The browser scales it up.
// update() runs at a fixed 60 ticks per second (adjusted by the speed setting), as the original hardware did.
(function () {
  'use strict';
  const SI = window.SI;
  const S = SI.sprites;
  const Font = window.PixelFont;
  const Store = window.ArcadeStore;

  const W = 224;
  const H = 256;
  const PLAYER_Y = 216;
  const PLAYER_MIN_X = 8;
  const PLAYER_MAX_X = W - 8 - 13;
  const SHIELD_Y = 192;
  const SHIELD_H = 16;
  const SHIELD_XS = [32, 77, 122, 167];
  const GROUND_Y = 239;
  const UFO_Y = 40;
  const UFO_INTERVAL = 1536; // ticks between mystery ships (~25 seconds)
  const FORMATION_TOP = 64;
  const WAVE_DROP = [0, 16, 24, 32, 32, 32, 40, 40, 40]; // each new wave starts lower
  const ROWS = 5;
  const COLS = 11;
  const ROW_TYPES = ['squid', 'crab', 'crab', 'octopus', 'octopus'];
  const POINTS = { squid: 30, crab: 20, octopus: 10 };
  // Mystery ship value depends on how many shots you've fired, as in the original (the "23rd shot" trick works).
  const UFO_POINTS = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100];
  const PLUNGER_COLS = [1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8];
  const SQUIGGLY_COLS = [11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10];
  const SHOT_TYPES = ['rolling', 'plunger', 'squiggly'];
  const LEFT_EDGE = 8;
  const RIGHT_EDGE = W - 8;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const DIFFICULTY = {
    easy: { reload: 1.6, startDrop: 0, firstShotDelay: 120 },
    normal: { reload: 1.0, startDrop: 0, firstShotDelay: 60 },
    hard: { reload: 0.7, startDrop: 8, firstShotDelay: 30 },
  };

  // Invaders fire faster as your score grows (original thresholds).
  function reloadTicks(score) {
    if (score < 200) return 48;
    if (score < 1000) return 16;
    if (score < 2000) return 11;
    if (score < 3000) return 8;
    return 7;
  }

  function waveDrop(wave) {
    const i = wave - 1;
    return i < WAVE_DROP.length ? WAVE_DROP[i] : WAVE_DROP[1 + ((i - 1) % (WAVE_DROP.length - 1))];
  }

  const pad = (n, len) => String(n).padStart(len, '0');

  class Game {
    constructor(sound) {
      this.sound = sound;
      this.settings = null;
      this.overlay = true;
      this.hiscores = Store.loadScores('invaders');
      this.players = [];
      this.cur = 0;
      this.state = 'attract';
      this.t = 0;
      this.paused = false;
      this.diff = DIFFICULTY.normal;
      this.shieldCanvas = document.createElement('canvas');
      this.shieldCanvas.width = W;
      this.shieldCanvas.height = SHIELD_H;
      this.shieldCtx = this.shieldCanvas.getContext('2d');
      this.shieldImg = this.shieldCtx.createImageData(W, SHIELD_H);
      this.beginRound(false);
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
      this.players = [];
      for (let i = 0; i < s.players; i++) this.players.push(this.newPlayer(i));
      this.cur = 0;
      this.firstRound = true;
      this.toReady();
    }

    quit() {
      this.sound.ufoStop();
      this.players = [];
      this.toAttract();
    }

    toAttract() {
      this.state = 'attract';
      this.t = 0;
      this.beginRound(false);
    }

    newPlayer(id) {
      const p = {
        id, score: 0, lives: this.settings.lives, wave: 1, bonusGiven: false, over: false,
        shotCount: 0, ufoTimer: UFO_INTERVAL, shotTypeIdx: 0, colPlunger: 0, colSquig: 0,
      };
      this.resetWave(p);
      return p;
    }

    // Build a fresh formation, shields and ground for player p.
    resetWave(p) {
      const top = FORMATION_TOP + waveDrop(p.wave) + this.diff.startDrop;
      p.invaders = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const type = ROW_TYPES[r];
          const w = S[type][0].w;
          p.invaders.push({ type, row: r, col: c, x: 24 + c * 16, y: top + r * 16, ox: Math.floor((16 - w) / 2), w, frame: 0, alive: true });
        }
      }
      // Invaders move one at a time, bottom-left first, which makes the classic ripple.
      p.order = p.invaders.slice().sort((a, b) => b.row - a.row || a.col - b.col);
      p.alive = ROWS * COLS;
      p.dir = 1;
      p.dropping = false;
      p.stepIdx = 0;
      p.marchNote = 0;
      p.shield = new Uint8Array(W * SHIELD_H);
      for (const sx of SHIELD_XS) {
        for (let y = 0; y < S.shield.h; y++) for (let x = 0; x < S.shield.w; x++) if (S.shield.px[y][x]) p.shield[y * W + sx + x] = 1;
      }
      p.ground = new Uint8Array(W).fill(1);
    }

    // Reset the moving pieces at the start of each life or wave.
    beginRound(keepX) {
      if (!keepX) this.px = 16;
      this.shot = null;
      this.alienShots = [];
      this.ufo = null;
      this.sound.ufoStop();
      this.invExplosion = null;
      this.effects = [];
      this.noteGap = 0;
      this.invaded = false;
      this.fireTimer = this.diff.firstShotDelay;
    }

    toReady() {
      this.state = 'ready';
      this.t = 0;
      this.readyMsg = this.firstRound || this.players.length > 1;
      this.firstRound = false;
      this.beginRound(false);
    }

    switchPlayer() {
      if (this.players.length < 2) return;
      const other = 1 - this.cur;
      if (!this.players[other].over) this.cur = other;
    }

    afterGameOver() {
      const other = this.players.find((q) => !q.over);
      if (other) {
        this.cur = other.id;
        this.toReady();
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
      if (this.paused) return;
      this.t++;
      switch (this.state) {
        case 'attract':
          if (input.pressed('start')) this.start();
          break;
        case 'ready':
          if (this.t >= (this.readyMsg ? 150 : 60)) {
            this.state = 'playing';
            this.t = 0;
          }
          break;
        case 'playing':
          this.updatePlaying(input);
          break;
        case 'dying':
          this.updateDying();
          break;
        case 'waveclear':
          if (this.t >= 120) {
            this.p.wave++;
            this.resetWave(this.p);
            this.beginRound(true);
            this.state = 'playing';
            this.t = 0;
          }
          break;
        case 'gameover':
          if (this.t >= 180) this.afterGameOver();
          break;
        case 'initials':
          this.updateInitials(input);
          break;
      }
      for (const e of this.effects) e.ttl--;
      this.effects = this.effects.filter((e) => e.ttl > 0);
    }

    updatePlaying(input) {
      const p = this.p;
      const left = input.down('left');
      const right = input.down('right');
      if (left && !right) this.px = Math.max(PLAYER_MIN_X, this.px - 1);
      else if (right && !left) this.px = Math.min(PLAYER_MAX_X, this.px + 1);

      if (input.pressed('fire') && !this.shot && !this.invExplosion) {
        this.shot = { x: this.px + 6, y: PLAYER_Y - 4 };
        p.shotCount++;
        this.sound.shoot();
      }

      this.updateShot(p);
      this.updateInvaders(p);
      if (this.state !== 'playing') return;
      this.updateAlienShots(p);
      if (this.state !== 'playing') return;
      this.updateUfo(p);

      if (!p.bonusGiven && this.settings.bonus > 0 && p.score >= this.settings.bonus) {
        p.bonusGiven = true;
        p.lives++;
        this.sound.extraLife();
      }
      if (p.alive === 0 && !this.invExplosion) {
        this.state = 'waveclear';
        this.t = 0;
        this.shot = null;
        this.alienShots = [];
        this.ufo = null;
        this.sound.ufoStop();
      }
    }

    updateShot(p) {
      const s = this.shot;
      if (!s) return;
      // Move 4 pixels, one at a time, so the shot can't skip through anything.
      for (let step = 0; step < 4; step++) {
        s.y--;
        if (s.y <= 32) {
          this.addEffect(S.shotBurst, s.x - 3, 32, 16);
          this.shot = null;
          return;
        }
        for (const inv of p.invaders) {
          if (!inv.alive) continue;
          const ix = inv.x + inv.ox;
          if (s.x < ix || s.x >= ix + inv.w || s.y >= inv.y + 8 || s.y + 4 <= inv.y) continue;
          const spr = S[inv.type][inv.frame];
          for (let yy = s.y; yy < s.y + 4; yy++) {
            const ry = yy - inv.y;
            if (ry >= 0 && ry < 8 && spr.px[ry][s.x - ix]) {
              this.killInvader(p, inv);
              return;
            }
          }
        }
        const u = this.ufo;
        if (u && !u.dead && s.x >= u.x && s.x < u.x + 16 && s.y < UFO_Y + 7 && s.y + 4 > UFO_Y) {
          this.hitUfo(p);
          return;
        }
        for (let i = 0; i < this.alienShots.length; i++) {
          const a = this.alienShots[i];
          if (s.x >= a.x && s.x <= a.x + 2 && s.y < a.y + 7 && s.y + 4 > a.y) {
            this.addEffect(S.alienBurst, a.x - 1, a.y, 16);
            this.alienShots.splice(i, 1);
            this.shot = null;
            return;
          }
        }
        const hitY = this.shieldHit(p, s.x, s.y, 1, 4);
        if (hitY >= 0) {
          this.erode(p, S.shotBurst, s.x - 3, hitY - 5);
          this.shot = null;
          return;
        }
      }
    }

    killInvader(p, inv) {
      inv.alive = false;
      p.alive--;
      p.score += POINTS[inv.type];
      this.invExplosion = { x: inv.x + 1, y: inv.y, ttl: 16 };
      this.shot = null;
      this.sound.invaderHit();
    }

    hitUfo(p) {
      const u = this.ufo;
      u.dead = true;
      u.ttl = 90;
      u.points = UFO_POINTS[p.shotCount % UFO_POINTS.length];
      p.score += u.points;
      this.shot = null;
      this.sound.ufoStop();
      this.sound.ufoHit();
    }

    updateInvaders(p) {
      if (this.invExplosion) {
        // The whole formation freezes briefly while a hit invader explodes.
        if (--this.invExplosion.ttl > 0) return;
        this.invExplosion = null;
      }
      this.noteGap++;
      const order = p.order;
      while (p.stepIdx < order.length && !order[p.stepIdx].alive) p.stepIdx++;
      if (p.stepIdx < order.length) {
        const inv = order[p.stepIdx++];
        if (p.dropping) inv.y += 8;
        else inv.x += 2 * p.dir;
        inv.frame ^= 1;
        if (inv.y + 8 > SHIELD_Y && inv.y < SHIELD_Y + SHIELD_H) this.erode(p, S[inv.type][inv.frame], inv.x + inv.ox, inv.y);
        if (inv.y + 8 >= PLAYER_Y) {
          this.killPlayer(true); // invaders landed: game over for this player
          return;
        }
      }
      while (p.stepIdx < order.length && !order[p.stepIdx].alive) p.stepIdx++;
      if (p.stepIdx >= order.length) {
        // Every invader has taken a step: sound the march and check for a screen edge.
        p.stepIdx = 0;
        if (this.noteGap >= 5) {
          this.sound.march(p.marchNote++);
          this.noteGap = 0;
        }
        if (p.dropping) {
          p.dropping = false;
        } else {
          const atEdge = p.invaders.some((inv) => inv.alive && (p.dir > 0 ? inv.x + inv.ox + inv.w >= RIGHT_EDGE : inv.x + inv.ox <= LEFT_EDGE));
          if (atEdge) {
            p.dropping = true;
            p.dir = -p.dir;
          }
        }
      }
    }

    updateAlienShots(p) {
      if (--this.fireTimer <= 0) {
        this.tryAlienFire(p);
        this.fireTimer = Math.max(4, Math.round(reloadTicks(p.score) * this.diff.reload));
      }
      const speed = p.alive <= 8 ? 5 : 4;
      for (let i = this.alienShots.length - 1; i >= 0; i--) {
        const a = this.alienShots[i];
        if (++a.tick < 3) continue; // shots move every third tick, as on the original
        a.tick = 0;
        a.frame = (a.frame + 1) & 3;
        const spr = S.shots[a.type][a.frame];
        for (let step = 0; step < speed; step++) {
          a.y++;
          if (a.y + 7 >= GROUND_Y) {
            this.erode(p, S.alienBurst, a.x - 1, GROUND_Y - 6);
            this.addEffect(S.alienBurst, a.x - 1, GROUND_Y - 8, 16);
            this.alienShots.splice(i, 1);
            break;
          }
          if (this.spriteHitsShield(p, spr, a.x, a.y)) {
            this.erode(p, S.alienBurst, a.x - 1, a.y + 2);
            this.addEffect(S.alienBurst, a.x - 1, a.y + 2, 16);
            this.alienShots.splice(i, 1);
            break;
          }
          if (this.spriteHitsPlayer(spr, a.x, a.y)) {
            this.killPlayer(false);
            return;
          }
        }
      }
    }

    tryAlienFire(p) {
      for (let k = 0; k < SHOT_TYPES.length; k++) {
        const type = SHOT_TYPES[p.shotTypeIdx];
        p.shotTypeIdx = (p.shotTypeIdx + 1) % SHOT_TYPES.length;
        if (this.alienShots.some((a) => a.type === type)) continue;
        if (type === 'plunger' && p.alive === 1) continue;
        let col;
        if (type === 'rolling') {
          // The rolling shot aims at you: it comes from the column nearest your cannon.
          let best = Infinity;
          for (const inv of p.invaders) {
            if (!inv.alive) continue;
            const d = Math.abs(inv.x + 8 - (this.px + 6));
            if (d < best) {
              best = d;
              col = inv.col;
            }
          }
        } else if (type === 'plunger') {
          col = PLUNGER_COLS[p.colPlunger++ % PLUNGER_COLS.length] - 1;
        } else {
          col = SQUIGGLY_COLS[p.colSquig++ % SQUIGGLY_COLS.length] - 1;
        }
        let shooter = null;
        for (const inv of p.invaders) if (inv.alive && inv.col === col && (!shooter || inv.y > shooter.y)) shooter = inv;
        if (shooter) this.alienShots.push({ type, x: shooter.x + 7, y: shooter.y + 8, frame: 0, tick: 0 });
        return;
      }
    }

    updateUfo(p) {
      const u = this.ufo;
      if (u) {
        if (u.dead) {
          if (--u.ttl <= 0) this.ufo = null;
          return;
        }
        u.x += u.dir;
        if (u.x < -16 || u.x > W) {
          this.ufo = null;
          this.sound.ufoStop();
        }
        return;
      }
      if (--p.ufoTimer <= 0) {
        p.ufoTimer = UFO_INTERVAL;
        if (p.alive >= 8) {
          const fromLeft = (p.shotCount & 1) === 1;
          this.ufo = { x: fromLeft ? -16 : W, dir: fromLeft ? 1 : -1, dead: false };
          this.sound.ufoStart();
        }
      }
    }

    killPlayer(invasion) {
      this.state = 'dying';
      this.t = 0;
      this.invaded = invasion;
      this.shot = null;
      this.alienShots = [];
      this.ufo = null;
      this.sound.ufoStop();
      this.sound.playerHit();
    }

    updateDying() {
      if (this.t < 120) return;
      const p = this.p;
      p.lives = this.invaded ? 0 : p.lives - 1;
      if (p.lives <= 0) {
        p.lives = 0;
        p.over = true;
        this.state = 'gameover';
        this.t = 0;
        return;
      }
      this.switchPlayer();
      this.toReady();
    }

    updateInitials(input) {
      const e = this.entry;
      const typed = input.typed();
      if (typed.length) {
        for (const ch of typed) if (e.pos < 3) e.letters[e.pos++] = LETTERS.indexOf(ch);
      } else {
        if (input.pressed('up') || input.pressed('tright')) e.letters[e.pos] = (e.letters[e.pos] + 1) % 26;
        if (input.pressed('down') || input.pressed('tleft')) e.letters[e.pos] = (e.letters[e.pos] + 25) % 26;
        if (input.pressed('left') && e.pos > 0) e.pos--;
        if (input.pressed('right') || input.pressed('select')) e.pos++;
      }
      if (e.pos >= 3) {
        const initials = e.letters.map((i) => LETTERS[i]).join('');
        this.hiscores = Store.addScore('invaders', this.hiscores, initials, e.player.score);
        this.nextInitials();
      }
    }

    // ---------- shields and collisions ----------

    // Returns the y of the first lit shield pixel inside the rectangle, or -1.
    shieldHit(p, x, y, w, h) {
      for (let yy = y + h - 1; yy >= y; yy--) {
        const r = yy - SHIELD_Y;
        if (r < 0 || r >= SHIELD_H) continue;
        for (let xx = x; xx < x + w; xx++) if (xx >= 0 && xx < W && p.shield[r * W + xx]) return yy;
      }
      return -1;
    }

    spriteHitsShield(p, spr, x, y) {
      for (let r = 0; r < spr.h; r++) {
        const sr = y + r - SHIELD_Y;
        if (sr < 0 || sr >= SHIELD_H) continue;
        for (let c = 0; c < spr.w; c++) if (spr.px[r][c] && p.shield[sr * W + x + c]) return true;
      }
      return false;
    }

    spriteHitsPlayer(spr, x, y) {
      const pl = S.player;
      for (let r = 0; r < spr.h; r++) {
        const pr = y + r - PLAYER_Y;
        if (pr < 0 || pr >= pl.h) continue;
        for (let c = 0; c < spr.w; c++) {
          const pc = x + c - this.px;
          if (spr.px[r][c] && pc >= 0 && pc < pl.w && pl.px[pr][pc]) return true;
        }
      }
      return false;
    }

    // Blast a hole in the shields (and ground line) in the shape of the given pattern.
    erode(p, pattern, ex, ey) {
      for (let r = 0; r < pattern.h; r++) {
        for (let c = 0; c < pattern.w; c++) {
          if (!pattern.px[r][c]) continue;
          const x = ex + c;
          const y = ey + r;
          if (x < 0 || x >= W) continue;
          if (y >= SHIELD_Y && y < SHIELD_Y + SHIELD_H) p.shield[(y - SHIELD_Y) * W + x] = 0;
          else if (y === GROUND_Y) p.ground[x] = 0;
        }
      }
    }

    addEffect(spr, x, y, ttl) {
      this.effects.push({ spr, x, y, ttl });
    }

    // ---------- drawing ----------

    render(ctx) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      this.drawHud(ctx);
      switch (this.state) {
        case 'attract':
          this.drawAttract(ctx);
          break;
        case 'initials':
          this.drawInitials(ctx);
          break;
        case 'ready':
          if (this.readyMsg) Font.center(ctx, 'PLAY PLAYER<' + (this.cur + 1) + '>', 112, 1, W);
          else this.drawPlayfield(ctx);
          break;
        default:
          this.drawPlayfield(ctx);
      }
      if (this.state === 'gameover') {
        ctx.clearRect(0, 44, W, 16);
        ctx.fillStyle = '#fff';
        Font.center(ctx, this.players.length > 1 ? 'GAME OVER PLAYER<' + (this.cur + 1) + '>' : 'GAME OVER', 48, 1, W);
      }
      if (this.paused) {
        ctx.clearRect(64, 112, 96, 24);
        ctx.fillStyle = '#fff';
        Font.center(ctx, 'PAUSED', 120, 1, W);
      }
      if (this.overlay) this.applyOverlay(ctx);
    }

    drawHud(ctx) {
      Font.draw(ctx, 'SCORE<1>', 8, 8);
      Font.draw(ctx, 'HI-SCORE', 80, 8);
      Font.draw(ctx, 'SCORE<2>', 152, 8);
      const best = this.hiscores.length ? this.hiscores[0].score : 0;
      const hi = Math.max(best, ...this.players.map((q) => q.score));
      const blink = this.state === 'ready' && this.readyMsg && (this.t >> 3) & 1;
      for (let i = 0; i < 2; i++) {
        const q = this.players[i];
        if (!q || (blink && i === this.cur)) continue;
        Font.draw(ctx, pad(q.score, 4), 24 + i * 144, 24);
      }
      Font.draw(ctx, pad(hi, 4), 96, 24);
    }

    drawPlayfield(ctx) {
      const p = this.p;
      if (!p) return;

      // Shields: copy the pixel mask into an image.
      const d = this.shieldImg.data;
      for (let i = 0; i < p.shield.length; i++) {
        const v = p.shield[i] ? 255 : 0;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
        d[i * 4 + 3] = v;
      }
      this.shieldCtx.putImageData(this.shieldImg, 0, 0);
      ctx.drawImage(this.shieldCanvas, 0, SHIELD_Y);

      ctx.fillStyle = '#fff';
      for (let x = 0; x < W; x++) if (p.ground[x]) ctx.fillRect(x, GROUND_Y, 1, 1);

      for (const inv of p.invaders) if (inv.alive) ctx.drawImage(S[inv.type][inv.frame].canvas, inv.x + inv.ox, inv.y);
      if (this.invExplosion) ctx.drawImage(S.invBurst.canvas, this.invExplosion.x, this.invExplosion.y);

      const u = this.ufo;
      if (u) {
        if (!u.dead) ctx.drawImage(S.ufo.canvas, u.x, UFO_Y);
        else if (u.ttl > 60) ctx.drawImage(S.ufoBurst.canvas, u.x - 4, UFO_Y);
        else Font.draw(ctx, String(u.points), u.x, UFO_Y);
      }

      if (this.state === 'dying') ctx.drawImage(S.playerBurst[(this.t >> 3) & 1].canvas, this.px - 1, PLAYER_Y);
      else if (this.state !== 'gameover') ctx.drawImage(S.player.canvas, this.px, PLAYER_Y);

      if (this.shot) ctx.fillRect(this.shot.x, this.shot.y, 1, 4);
      for (const a of this.alienShots) ctx.drawImage(S.shots[a.type][a.frame].canvas, a.x, a.y);
      for (const e of this.effects) ctx.drawImage(e.spr.canvas, e.x, e.y);

      // Bottom row: lives left, spare cannons, wave number.
      Font.draw(ctx, String(p.lives), 8, 241);
      for (let i = 0; i < Math.min(p.lives - 1, 5); i++) ctx.drawImage(S.player.canvas, 24 + i * 16, 241);
      Font.draw(ctx, 'WAVE ' + pad(p.wave, 2), 160, 241);
    }

    drawAttract(ctx) {
      const page = Math.floor(this.t / 600) % 2;
      const t = this.t % 600;
      if (page === 0) {
        // Type out the title like the original attract screen.
        const type = (str, start, y) => Font.center(ctx, str.slice(0, Math.max(0, Math.floor((t - start) / 6))).padEnd(str.length, ' '), y, 1, W);
        type('PLAY', 0, 64);
        type('STAR INVADERS', 30, 88);
        if (t >= 130) {
          Font.center(ctx, '*SCORE ADVANCE TABLE*', 120, 1, W);
          const rows = [
            [S.ufo, 56, '=? MYSTERY'],
            [S.squid[0], 60, '=30 POINTS'],
            [S.crab[0], 59, '=20 POINTS'],
            [S.octopus[0], 58, '=10 POINTS'],
          ];
          rows.forEach(([spr, x, label], i) => {
            if (t < 150 + i * 20) return;
            ctx.drawImage(spr.canvas, x, 138 + i * 16);
            Font.draw(ctx, label, 82, 138 + i * 16);
          });
        }
      } else {
        Font.center(ctx, 'HIGH SCORES', 56, 1, W);
        if (!this.hiscores.length) Font.center(ctx, 'NO SCORES YET', 96, 1, W);
        this.hiscores.forEach((s, i) => {
          const y = 76 + i * 12;
          Font.draw(ctx, String(i + 1).padStart(2, ' ') + '.', 40, y);
          Font.draw(ctx, s.initials, 80, y);
          Font.draw(ctx, pad(s.score, 5), 128, y);
        });
      }
      if ((this.t >> 5) & 1) Font.center(ctx, this.touch ? 'TAP FIRE TO PLAY' : 'PRESS ENTER TO PLAY', 210, 1, W);
      Font.center(ctx, this.touch ? 'SETTINGS BUTTON - MENU' : 'ESC - SETTINGS', 226, 1, W);
    }

    drawInitials(ctx) {
      const e = this.entry;
      Font.center(ctx, 'NEW HIGH SCORE!', 64, 1, W);
      if (this.players.length > 1) Font.center(ctx, 'PLAYER<' + (e.player.id + 1) + '>', 84, 1, W);
      Font.center(ctx, pad(e.player.score, 4), 100, 1, W);
      Font.center(ctx, 'ENTER YOUR INITIALS', 128, 1, W);
      const str = e.letters.map((i) => LETTERS[i]).join('');
      const x0 = Math.round((W - Font.width(str, 3)) / 2);
      Font.draw(ctx, str, x0, 148, 3);
      if ((this.t >> 4) & 1 && e.pos < 3) ctx.fillRect(x0 + e.pos * 24, 172, 15, 2);
      Font.center(ctx, this.touch ? 'ARROWS = LETTER' : 'TYPE OR UP/DOWN', 196, 1, W);
      Font.center(ctx, this.touch ? 'FIRE = NEXT' : 'SPACE = NEXT', 208, 1, W);
    }

    // The original cabinet had no color, just strips of colored cellophane on the screen.
    applyOverlay(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#ff3030';
      ctx.fillRect(0, 32, W, 24);
      ctx.fillStyle = '#30ff50';
      ctx.fillRect(0, 184, W, 56);
      ctx.fillRect(24, 240, 112, 16);
      ctx.restore();
    }
  }

  SI.Game = Game;
  SI.SCREEN = { W, H };
})();
