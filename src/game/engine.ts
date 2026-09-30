import {
  CELL, COLS, ROWS, VIEW_W, VIEW_H, PATH_WAYPOINTS,
  TOWERS, ENEMIES, START_GOLD, START_LIVES, MAX_LIVES,
  FIRST_INTERMISSION, INTERMISSION,
  type TowerType, type EnemyType,
  DMG_MUL, RATE_MUL, RANGE_MUL, MAX_LEVEL, upgradeCost, sellValue,
  hpMul, speedMul, bountyMul, scoreMul,
} from "./config";
import { clamp, rand, turnTowards, hexToRgba, mulberry32 } from "./util";
import { Particles } from "./particles";
import {
  drawSprite, glowSprite, enemySprite, towerBaseSprite, towerHeadSprite,
  coreSprite, portalSprite, type Sprite,
} from "./sprites";
import { AudioEngine } from "./audio";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type GamePhase = "menu" | "playing" | "paused" | "over";

export interface HudState {
  phase: GamePhase;
  gold: number;
  lives: number;
  maxLives: number;
  wave: number;
  score: number;
  kills: number;
  enemiesLeft: number;
  speed: number;
  intermission: number; // seconds until next wave (0 = wave running)
  muted: boolean;
}

export interface InspectInfo {
  id: number;
  type: TowerType;
  name: string;
  color: string;
  level: number;
  maxLevel: number;
  dmg: number;
  rate: number;
  range: number;
  kills: number;
  invested: number;
  nextDmg: number | null;
  upgradeCost: number | null;
  sellValue: number;
  x: number;
  y: number;
}

export interface ViewState { scale: number; ox: number; oy: number; cssW: number; cssH: number }
export interface FinalStats { score: number; wave: number; kills: number }

export interface EngineCallbacks {
  onHud: (h: HudState) => void;
  onPhase: (p: GamePhase) => void;
  onInspect: (i: InspectInfo | null) => void;
  onBuild: (t: TowerType | null) => void;
  onView: (v: ViewState) => void;
  onGameOver: (f: FinalStats) => void;
}

interface Seg { x1: number; y1: number; x2: number; y2: number; len: number; dx: number; dy: number; cum: number }

interface Enemy {
  alive: boolean;
  type: EnemyType;
  x: number; y: number;
  dist: number;
  angle: number;
  hp: number; maxHp: number;
  speed: number;
  radius: number;
  bounty: number; score: number; lifeCost: number;
  color: string;
  slowUntil: number; slowFactor: number; slowed: boolean;
  flash: number; wob: number; spawnT: number;
}

interface Tower {
  id: number;
  type: TowerType;
  gx: number; gy: number;
  x: number; y: number;
  level: number;
  range: number; dmg: number; rate: number;
  aoe: number; slow: number; slowDur: number;
  cool: number;
  angle: number;
  target: Enemy | null;
  kills: number;
  invested: number;
  recoil: number; muzzle: number;
}

interface Proj {
  alive: boolean;
  kind: "pulse" | "mortar";
  x: number; y: number; px: number; py: number;
  target: Enemy;
  tx: number; ty: number;
  speed: number;
  dmg: number;
  aoe: number;
  src: Tower | null;
  flight: number; flightT: number;
  color: string;
}

interface Beam { x1: number; y1: number; x2: number; y2: number; life: number; max: number; color: string }

interface SpawnItem { type: EnemyType; at: number }

const MARGIN = 44;

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

export class Engine {
  audio = new AudioEngine();

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;

  phase: GamePhase = "menu";

  // viewport
  private dpr = 1;
  private cssW = 1; private cssH = 1;
  private scale = 1;
  private ox = 0; private oy = 0;

  // static layers
  private bg: HTMLCanvasElement | null = null;

  // sprites
  private eSpr: Record<EnemyType, Sprite>;
  private tBase: Record<TowerType, Sprite>;
  private tHead: Record<TowerType, Sprite>;
  private coreSpr = coreSprite();
  private portalSpr = portalSprite();

  // path
  private pts: { x: number; y: number }[] = [];
  private segs: Seg[] = [];
  private totalLen = 1;
  private pathMask: boolean[] = [];
  private leakDist = 1;

  // state
  private gold = START_GOLD;
  private lives = START_LIVES;
  private score = 0;
  private kills = 0;
  private wave = 0;
  private timeScale = 1;
  private time = 0;
  private hitStop = 0;
  private slowmo = 0;
  private trauma = 0;
  private leakFlash = 0;
  private hpM = 1; private spM = 1; private boM = 1;

  private waveState: "idle" | "intermission" | "active" = "idle";
  private waveTimer = 0;
  private waveTime = 0;
  private queue: SpawnItem[] = [];
  private qIdx = 0;
  private seen: Set<EnemyType> = new Set();

  private enemies: Enemy[] = [];
  private aliveCount = 0;
  private towers: Tower[] = [];
  private occ: number[] = [];
  private projs: Proj[] = [];
  private beams: Beam[] = [];
  private particles = new Particles();

  private nextTowerId = 1;
  private towerSeq = 0;

  // input/ui
  private buildType: TowerType | null = null;
  private hover = { gx: 0, gy: 0, active: false };
  private cursor = { gx: 8, gy: 5, active: false };
  private inspectId: number | null = null;

  private banner = { title: "", sub: "", color: "#22d3ee", t: 9, max: 9 };

  private raf = 0;
  private lastTs = 0;
  private hudTimer = 0;
  private ambientT = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;

    // build path points
    this.pts = PATH_WAYPOINTS.map(([gx, gy]) => ({ x: (gx + 0.5) * CELL, y: (gy + 0.5) * CELL }));
    let cum = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      this.segs.push({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y, len,
        dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, cum,
      });
      cum += len;
    }
    this.totalLen = cum;
    this.leakDist = cum - CELL * 0.85; // enemies die against the core, not past it

    // build path mask (blocked cells)
    this.pathMask = new Array(COLS * ROWS).fill(false);
    this.occ = new Array(COLS * ROWS).fill(0);
    for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
      const [ax, ay] = PATH_WAYPOINTS[i];
      const [bx, by] = PATH_WAYPOINTS[i + 1];
      if (ay === by) {
        const y = ay;
        for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
          if (x >= 0 && x < COLS && y >= 0 && y < ROWS) this.pathMask[y * COLS + x] = true;
        }
      } else {
        const x = ax;
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
          if (x >= 0 && x < COLS && y >= 0 && y < ROWS) this.pathMask[y * COLS + x] = true;
        }
      }
    }

    // pre-render entity sprites
    this.eSpr = {
      grunt: enemySprite("grunt", ENEMIES.grunt.color, ENEMIES.grunt.radius),
      runner: enemySprite("runner", ENEMIES.runner.color, ENEMIES.runner.radius),
      tank: enemySprite("tank", ENEMIES.tank.color, ENEMIES.tank.radius),
      splitter: enemySprite("splitter", ENEMIES.splitter.color, ENEMIES.splitter.radius),
      boss: enemySprite("boss", ENEMIES.boss.color, ENEMIES.boss.radius),
    };
    this.tBase = {
      pulse: towerBaseSprite(TOWERS.pulse.color),
      rail: towerBaseSprite(TOWERS.rail.color),
      frost: towerBaseSprite(TOWERS.frost.color),
      mortar: towerBaseSprite(TOWERS.mortar.color),
    };
    this.tHead = {
      pulse: towerHeadSprite("pulse", TOWERS.pulse.color),
      rail: towerHeadSprite("rail", TOWERS.rail.color),
      frost: towerHeadSprite("frost", TOWERS.frost.color),
      mortar: towerHeadSprite("mortar", TOWERS.mortar.color),
    };

    // preload display font for canvas text
    try {
      void document.fonts?.load("900 34px Orbitron");
      void document.fonts?.load("700 14px Rajdhani");
    } catch { /* noop */ }

    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(loop);
      let rdt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (rdt > 0.06) rdt = 0.06;
      if (rdt < 0) rdt = 0;

      if (this.phase !== "paused") {
        let dt = rdt * this.timeScale;
        if (this.hitStop > 0) { this.hitStop -= rdt; dt *= 0.1; }
        if (this.slowmo > 0) { this.slowmo -= rdt; dt *= 0.35; }
        this.update(dt, rdt);
      }
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
    this.pushHud();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.audio.destroy();
  }

  // ── viewport ─────────────────────────────────────────────

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW; this.cssH = cssH;
    this.dpr = Math.min(dpr || 1, 2);
    this.canvas.width = Math.max(2, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(2, Math.round(cssH * this.dpr));
    this.scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
    this.ox = (cssW - VIEW_W * this.scale) / 2;
    this.oy = (cssH - VIEW_H * this.scale) / 2;
    this.buildStatic();
    this.cb.onView({ scale: this.scale, ox: this.ox, oy: this.oy, cssW, cssH });
  }

  private buildStatic(): void {
    const sd = Math.max(0.4, this.scale * this.dpr);
    const w = Math.ceil((VIEW_W + MARGIN * 2) * sd);
    const h = Math.ceil((VIEW_H + MARGIN * 2) * sd);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d")!;
    c.scale(sd, sd);
    c.translate(MARGIN, MARGIN);

    // backdrop
    const bg = c.createLinearGradient(0, 0, 0, VIEW_H);
    bg.addColorStop(0, "#070b1c");
    bg.addColorStop(0.55, "#060818");
    bg.addColorStop(1, "#04050e");
    c.fillStyle = bg;
    c.fillRect(-MARGIN, -MARGIN, VIEW_W + MARGIN * 2, VIEW_H + MARGIN * 2);

    // nebulas
    const neb = (x: number, y: number, r: number, col: string, a: number) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexToRgba(col, a));
      g.addColorStop(1, hexToRgba(col, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(VIEW_W * 0.18, VIEW_H * 0.2, 260, "#e879f9", 0.05);
    neb(VIEW_W * 0.85, VIEW_H * 0.75, 300, "#22d3ee", 0.055);
    neb(VIEW_W * 0.55, VIEW_H * 0.05, 220, "#6366f1", 0.04);

    // stars
    const rnd = mulberry32(1337);
    for (let i = 0; i < 150; i++) {
      const x = rnd() * (VIEW_W + MARGIN * 2) - MARGIN;
      const y = rnd() * (VIEW_H + MARGIN * 2) - MARGIN;
      const r = rnd() * 1.1 + 0.3;
      c.globalAlpha = rnd() * 0.5 + 0.12;
      c.fillStyle = rnd() > 0.8 ? "#a5f3fc" : "#cbd5e1";
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // grid
    c.strokeStyle = "rgba(122,162,255,0.05)";
    c.lineWidth = 1;
    for (let x = 0; x <= VIEW_W; x += CELL) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, VIEW_H); c.stroke();
    }
    for (let y = 0; y <= VIEW_H; y += CELL) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(VIEW_W, y); c.stroke();
    }

    // board frame
    c.strokeStyle = "rgba(122,162,255,0.14)";
    c.lineWidth = 1.5;
    c.strokeRect(0.5, 0.5, VIEW_W - 1, VIEW_H - 1);

    // path
    const trace = () => {
      c.beginPath();
      c.moveTo(this.pts[0].x, this.pts[0].y);
      for (let i = 1; i < this.pts.length; i++) c.lineTo(this.pts[i].x, this.pts[i].y);
    };
    c.lineJoin = "round";
    c.lineCap = "round";
    trace();
    c.strokeStyle = "#080c1d";
    c.lineWidth = CELL * 0.92;
    c.stroke();
    trace();
    c.strokeStyle = "#0d1430";
    c.lineWidth = CELL * 0.66;
    c.stroke();
    trace();
    c.strokeStyle = "rgba(94,180,255,0.12)";
    c.lineWidth = CELL * 0.6;
    c.stroke();
    trace();
    c.strokeStyle = "rgba(10,14,32,1)";
    c.lineWidth = CELL * 0.52;
    c.stroke();

    this.bg = cv;
  }

  // ── public control ───────────────────────────────────────

  startGame(): void {
    this.audio.unlock();
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.time = 0;
    this.trauma = 0;
    this.leakFlash = 0;
    this.hitStop = 0;
    this.slowmo = 0;
    this.timeScale = 1;
    this.enemies.length = 0;
    this.aliveCount = 0;
    this.towers.length = 0;
    this.occ.fill(0);
    this.projs.forEach((p) => (p.alive = false));
    this.beams.length = 0;
    this.particles.clear();
    this.queue = [];
    this.qIdx = 0;
    this.seen.clear();
    this.inspectId = null;
    this.cb.onInspect(null);
    this.buildType = null;
    this.cb.onBuild(null);
    this.cursor.active = false;

    this.phase = "playing";
    this.waveState = "intermission";
    this.waveTimer = FIRST_INTERMISSION;
    this.audio.intensity = 1;
    this.setBanner("DEFEND THE CORE", "place towers — first wave inbound", "#22d3ee", 2.6);
    this.audio.play("wave");
    this.cb.onPhase("playing");
    this.pushHud();
  }

  toMenu(): void {
    this.phase = "menu";
    this.enemies.length = 0;
    this.aliveCount = 0;
    this.towers.length = 0;
    this.occ.fill(0);
    this.projs.forEach((p) => (p.alive = false));
    this.beams.length = 0;
    this.particles.clear();
    this.queue = [];
    this.waveState = "idle";
    this.trauma = 0;
    this.leakFlash = 0;
    this.banner.t = this.banner.max;
    this.audio.intensity = 0.55;
    this.inspectId = null;
    this.cb.onInspect(null);
    this.buildType = null;
    this.cb.onBuild(null);
    this.cb.onPhase("menu");
    this.pushHud();
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.cb.onPhase("paused");
    this.pushHud();
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.audio.unlock();
    this.cb.onPhase("playing");
    this.pushHud();
  }

  togglePause(): void {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  toggleSpeed(): void {
    this.timeScale = this.timeScale === 1 ? 2 : 1;
    this.audio.play("ui");
    this.pushHud();
  }

  toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.pushHud();
  }

  setBuildType(t: TowerType | null): void {
    this.buildType = t;
    if (t) {
      this.inspectId = null;
      this.cb.onInspect(null);
    }
    this.audio.play("ui");
    this.cb.onBuild(t);
  }

  callWaveEarly(): void {
    if (this.phase !== "playing" || this.waveState !== "intermission") return;
    const bonus = Math.ceil(this.waveTimer) * 2;
    if (bonus > 0) {
      this.gold += bonus;
      this.particles.text(VIEW_W / 2, VIEW_H * 0.42, `EARLY CALL +${bonus} G`, "#4ade80", 15);
    }
    this.startWave();
  }

  escape(): void {
    if (this.phase === "paused") { this.resume(); return; }
    if (this.phase !== "playing") return;
    if (this.buildType) { this.setBuildType(null); return; }
    if (this.inspectId !== null) { this.setInspect(null); return; }
    this.pause();
  }

  // ── pointer & keyboard cursor ────────────────────────────

  private toGrid(px: number, py: number): { gx: number; gy: number; ok: boolean } {
    const wx = (px - this.ox) / this.scale;
    const wy = (py - this.oy) / this.scale;
    const gx = Math.floor(wx / CELL);
    const gy = Math.floor(wy / CELL);
    return { gx, gy, ok: gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS };
  }

  pointerMove(px: number, py: number): void {
    const { gx, gy, ok } = this.toGrid(px, py);
    this.hover.gx = gx; this.hover.gy = gy; this.hover.active = ok;
    if (ok) this.cursor.active = false;
  }

  pointerLeave(): void {
    this.hover.active = false;
  }

  pointerDown(px: number, py: number, button: number): void {
    this.audio.unlock();
    if (this.phase !== "playing") return;
    if (button === 2) {
      if (this.buildType) this.setBuildType(null);
      else this.setInspect(null);
      return;
    }
    const { gx, gy, ok } = this.toGrid(px, py);
    if (!ok) {
      this.setInspect(null);
      return;
    }
    if (this.buildType) {
      this.tryPlace(gx, gy);
      return;
    }
    const t = this.towerAt(gx, gy);
    if (t) this.setInspect(t.id);
    else this.setInspect(null);
  }

  moveCursor(dx: number, dy: number): void {
    if (this.phase !== "playing") return;
    this.cursor.gx = clamp(this.cursor.gx + dx, 0, COLS - 1);
    this.cursor.gy = clamp(this.cursor.gy + dy, 0, ROWS - 1);
    this.cursor.active = true;
    this.hover.active = false;
  }

  confirmCursor(): void {
    if (this.phase !== "playing" || !this.cursor.active) return;
    const { gx, gy } = this.cursor;
    if (this.buildType) {
      this.tryPlace(gx, gy);
      return;
    }
    const t = this.towerAt(gx, gy);
    if (t) this.setInspect(t.id);
    else this.setInspect(null);
  }

  // ── towers ───────────────────────────────────────────────

  private towerAt(gx: number, gy: number): Tower | null {
    const id = this.occ[gy * COLS + gx];
    if (!id) return null;
    return this.towers.find((t) => t.id === id) ?? null;
  }

  private statsFor(t: Tower): void {
    const def = TOWERS[t.type];
    const i = t.level - 1;
    t.dmg = Math.round(def.dmg * DMG_MUL[i]);
    t.rate = def.rate * RATE_MUL[i];
    t.range = Math.round(def.range * RANGE_MUL[i]);
    t.aoe = (def.aoe ?? 0) + (t.level - 1) * 14;
    t.slow = clamp((def.slow ?? 0) + (t.level - 1) * 0.1, 0, 0.68);
    t.slowDur = (def.slowDur ?? 0) + (t.level - 1) * 0.35;
  }

  private tryPlace(gx: number, gy: number): void {
    const type = this.buildType;
    if (!type) return;
    const cx = (gx + 0.5) * CELL;
    const cy = (gy + 0.5) * CELL;

    const fail = (msg: string) => {
      this.particles.text(cx, cy - 14, msg, "#f87171", 12);
      this.audio.play("deny");
      this.trauma = Math.min(1, this.trauma + 0.1);
    };

    if (this.pathMask[gy * COLS + gx]) { fail("BLOCKED"); return; }
    if (this.occ[gy * COLS + gx]) { fail("OCCUPIED"); return; }
    const def = TOWERS[type];
    if (this.gold < def.cost) { fail(`${def.cost}G NEEDED`); return; }

    this.gold -= def.cost;
    const t: Tower = {
      id: this.nextTowerId++,
      type, gx, gy, x: cx, y: cy,
      level: 1,
      range: 0, dmg: 0, rate: 0, aoe: 0, slow: 0, slowDur: 0,
      cool: 0.15,
      angle: -Math.PI / 2,
      target: null,
      kills: 0,
      invested: def.cost,
      recoil: 0, muzzle: 0,
    };
    this.statsFor(t);
    this.towers.push(t);
    this.occ[gy * COLS + gx] = t.id;
    this.towerSeq++;

    this.particles.ring(cx, cy, def.color, 4, CELL * 0.75, 0.4, 3);
    this.particles.burst(cx, cy, def.color, 14, 120, 4, 0.4);
    this.trauma = Math.min(1, this.trauma + 0.08);
    this.audio.play("place");

    // auto deselect if broke
    if (this.gold < def.cost) this.setBuildType(null);
    this.pushHud();
  }

  setInspect(id: number | null): void {
    this.inspectId = id;
    if (id === null) { this.cb.onInspect(null); return; }
    const t = this.towers.find((x) => x.id === id);
    this.cb.onInspect(t ? this.inspectInfo(t) : null);
  }

  private inspectInfo(t: Tower): InspectInfo {
    const def = TOWERS[t.type];
    const atMax = t.level >= MAX_LEVEL;
    const nextDmg = atMax ? null : Math.round(def.dmg * DMG_MUL[t.level]);
    return {
      id: t.id,
      type: t.type,
      name: def.name,
      color: def.color,
      level: t.level,
      maxLevel: MAX_LEVEL,
      dmg: t.dmg,
      rate: Math.round(t.rate * 100) / 100,
      range: t.range,
      kills: t.kills,
      invested: t.invested,
      nextDmg,
      upgradeCost: atMax ? null : upgradeCost(t.type, t.level),
      sellValue: sellValue(t.invested),
      x: t.x, y: t.y,
    };
  }

  upgradeInspected(): void {
    if (this.inspectId === null) return;
    const t = this.towers.find((x) => x.id === this.inspectId);
    if (!t || t.level >= MAX_LEVEL) return;
    const cost = upgradeCost(t.type, t.level);
    if (this.gold < cost) {
      this.particles.text(t.x, t.y - 18, `${cost}G NEEDED`, "#f87171", 12);
      this.audio.play("deny");
      return;
    }
    this.gold -= cost;
    t.invested += cost;
    t.level++;
    this.statsFor(t);
    const def = TOWERS[t.type];
    this.particles.ring(t.x, t.y, def.color, 4, CELL, 0.5, 3);
    this.particles.ring(t.x, t.y, "#ffffff", 2, CELL * 0.6, 0.3, 2);
    this.particles.burst(t.x, t.y, def.color, 20, 150, 5, 0.5);
    this.trauma = Math.min(1, this.trauma + 0.12);
    this.audio.play("upgrade");
    this.setInspect(t.id);
    this.pushHud();
  }

  sellInspected(): void {
    if (this.inspectId === null) return;
    const idx = this.towers.findIndex((x) => x.id === this.inspectId);
    if (idx < 0) return;
    const t = this.towers[idx];
    const value = sellValue(t.invested);
    this.gold += value;
    this.occ[t.gy * COLS + t.gx] = 0;
    this.towers.splice(idx, 1);
    this.particles.text(t.x, t.y - 10, `+${value}G`, "#4ade80", 13);
    this.particles.burst(t.x, t.y, "#94a3b8", 12, 90, 4, 0.4);
    this.audio.play("sell");
    this.setInspect(null);
    this.pushHud();
  }

  // ── waves ────────────────────────────────────────────────

  private buildQueue(n: number): SpawnItem[] {
    const q: SpawnItem[] = [];
    let t = 0.7;
    const group = (type: EnemyType, count: number, interval: number, gap: number) => {
      t += gap;
      for (let i = 0; i < count; i++) {
        q.push({ type, at: t });
        t += interval;
      }
    };
    group("grunt", Math.min(8 + n * 2, 34), clamp(0.85 - n * 0.03, 0.32, 0.85), 0);
    if (n >= 2) group("runner", Math.min(3 + n, 22), 0.55, 1.2);
    if (n >= 3) group("grunt", Math.min(4 + n, 26), 0.42, 1.0);
    if (n >= 4) group("tank", Math.min(1 + Math.floor(n / 2), 10), 1.5, 1.6);
    if (n >= 6) group("splitter", Math.min(1 + Math.floor(n / 2), 10), 1.1, 1.6);
    if (n % 5 === 0) {
      const bosses = n >= 20 ? 3 : n >= 10 ? 2 : 1;
      group("boss", bosses, 3.5, 2.0);
      group("runner", Math.min(6 + n, 22), 0.4, 0.5);
    }
    q.sort((a, b) => a.at - b.at);
    return q;
  }

  private startWave(): void {
    this.wave++;
    this.hpM = hpMul(this.wave);
    this.spM = speedMul(this.wave);
    this.boM = bountyMul(this.wave);
    this.queue = this.buildQueue(this.wave);
    this.qIdx = 0;
    this.waveTime = 0;
    this.waveState = "active";

    const hasBoss = this.queue.some((q) => q.type === "boss");
    this.audio.intensity = hasBoss ? 1.5 : 1 + Math.min(0.25, this.wave * 0.01);

    // first-time threat warnings
    let hint = "";
    for (const q of this.queue) {
      if (!this.seen.has(q.type)) {
        const d = ENEMIES[q.type];
        hint = `NEW THREAT: ${d.name} — ${d.hint}`;
        this.seen.add(q.type);
        break;
      }
    }
    if (hasBoss) {
      this.setBanner("!! OVERLORD INBOUND !!", ENEMIES.boss.hint, "#ff2d78", 2.4);
      this.audio.play("boss");
      this.trauma = Math.min(1, this.trauma + 0.25);
    } else {
      this.setBanner(`WAVE ${this.wave}`, hint || (this.wave === 1 ? "they're coming from the left rift" : ""), "#22d3ee", 2.0);
      this.audio.play("wave");
    }
    this.pushHud();
  }

  private waveCleared(): void {
    const bonus = 25 + this.wave * 5;
    this.gold += bonus;
    this.score += this.wave * 40;
    let sub = `+${bonus} GOLD`;
    if (this.wave % 5 === 0) {
      const heal = Math.min(3, MAX_LIVES - this.lives);
      if (heal > 0) {
        this.lives += heal;
        sub += `  ·  +${heal} INTEGRITY`;
      }
    }
    this.setBanner(`WAVE ${this.wave} CLEARED`, sub, "#34d399", 2.0);
    this.audio.play("upgrade");
    this.waveState = "intermission";
    this.waveTimer = INTERMISSION;
    this.audio.intensity = 0.85;
    this.pushHud();
  }

  private spawn(type: EnemyType, dist = 0, hpScale = 1): void {
    let e = this.enemies.find((x) => !x.alive);
    if (!e) {
      e = {
        alive: false, type, x: 0, y: 0, dist: 0, angle: 0,
        hp: 0, maxHp: 0, speed: 0, radius: 0,
        bounty: 0, score: 0, lifeCost: 1, color: "#fff",
        slowUntil: 0, slowFactor: 1, slowed: false,
        flash: 0, wob: 0, spawnT: 0,
      };
      this.enemies.push(e);
    }
    const def = ENEMIES[type];
    e.alive = true;
    e.type = type;
    e.dist = dist;
    e.maxHp = Math.round(def.hp * this.hpM * hpScale);
    e.hp = e.maxHp;
    e.speed = def.speed * this.spM * rand(0.94, 1.06);
    e.radius = def.radius;
    e.bounty = def.bounty;
    e.score = def.score;
    e.lifeCost = def.lifeCost;
    e.color = def.color;
    e.slowUntil = 0; e.slowFactor = 1; e.slowed = false;
    e.flash = 0; e.wob = rand(0, 6); e.spawnT = 0;
    this.placeOnPath(e);
    this.aliveCount++;

    if (dist === 0) {
      this.particles.burst(e.x + CELL * 0.4, e.y, def.color, 5, 70, 4, 0.3);
    }
    if (type === "boss") {
      this.trauma = Math.min(1, this.trauma + 0.35);
      this.audio.play("boss");
      this.particles.ring(e.x + CELL * 0.5, e.y, def.color, 6, 60, 0.7, 4);
    }
  }

  private segFor(d: number): Seg | null {
    for (const s of this.segs) {
      if (d <= s.cum + s.len) return s;
    }
    return this.segs[this.segs.length - 1] ?? null;
  }

  private placeOnPath(e: Enemy): void {
    const d = clamp(e.dist, 0, this.totalLen - 0.001);
    const s = this.segFor(d)!;
    const k = d - s.cum;
    e.x = s.x1 + s.dx * k;
    e.y = s.y1 + s.dy * k;
    e.angle = Math.atan2(s.dy, s.dx);
  }

  // ── combat ───────────────────────────────────────────────

  private damageEnemy(e: Enemy, dmg: number, src: Tower | null): void {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 0.1;
    if (e.hp <= 0) this.kill(e, src);
  }

  private kill(e: Enemy, src: Tower | null): void {
    e.alive = false;
    this.aliveCount--;
    const g = Math.round(e.bounty * this.boM);
    this.gold += g;
    const sc = Math.round(e.score * scoreMul(this.wave));
    this.score += sc;
    this.kills++;
    if (src) src.kills++;

    const big = e.type === "boss";
    const med = e.type === "tank" || e.type === "splitter";
    this.particles.burst(e.x, e.y, e.color, big ? 46 : med ? 22 : 12, big ? 260 : 180, big ? 7 : 5, big ? 0.9 : 0.55, 60);
    this.particles.burst(e.x, e.y, "#ffffff", big ? 14 : 5, 220, 3, 0.35);
    this.particles.ring(e.x, e.y, e.color, 4, big ? 90 : med ? 42 : 26, big ? 0.8 : 0.45, big ? 5 : 3);
    this.particles.text(e.x, e.y - e.radius - 6, `+${g}G`, "#fde047", 12);

    if (e.type === "splitter") {
      for (let i = 0; i < 2; i++) {
        this.spawn("runner", Math.max(0, e.dist - 8 - i * 14), 0.85);
      }
    }
    if (big) {
      this.trauma = Math.min(1, this.trauma + 0.8);
      this.hitStop = 0.16;
      this.audio.play("bigboom");
      this.particles.text(e.x, e.y - 34, `OVERLORD DOWN  +${sc}`, "#fda4af", 18);
      this.particles.ring(e.x, e.y, "#ffffff", 2, 130, 0.9, 4);
    } else if (med) {
      this.trauma = Math.min(1, this.trauma + 0.15);
      this.audio.play("boom", 60);
    } else {
      this.audio.play("kill", 45);
    }
    this.pushHud();
  }

  private leak(e: Enemy): void {
    e.alive = false;
    this.aliveCount--;
    if (this.phase !== "playing") return;
    this.lives -= e.lifeCost;
    this.leakFlash = 1;
    this.trauma = Math.min(1, this.trauma + (e.type === "boss" ? 0.7 : 0.35));
    this.audio.play("leak");
    this.particles.burst(this.endPoint().x - 10, e.y, "#ef4444", 18, 160, 5, 0.5);
    this.particles.ring(this.endPoint().x - 12, e.y, "#ef4444", 4, 44, 0.5, 3);
    this.particles.text(this.endPoint().x - 30, e.y - 16, `-${e.lifeCost}`, "#f87171", 16);
    if (this.lives <= 0) {
      this.lives = 0;
      this.gameOver();
    }
    this.pushHud();
  }

  private endPoint(): { x: number; y: number } {
    return this.pts[this.pts.length - 1];
  }

  private gameOver(): void {
    this.phase = "over";
    this.slowmo = 1.3;
    this.trauma = 1;
    this.setBanner("CORE BREACHED", "", "#ef4444", 3);
    this.audio.play("gameover");
    this.audio.intensity = 0.4;
    this.particles.burst(this.endPoint().x - 12, this.endPoint().y, "#ef4444", 60, 280, 7, 1.1, 40);
    this.particles.ring(this.endPoint().x - 12, this.endPoint().y, "#ef4444", 6, 140, 1, 6);
    this.cb.onPhase("over");
    this.cb.onGameOver({ score: this.score, wave: this.wave, kills: this.kills });
    this.pushHud();
  }

  private acquire(t: Tower): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    const r2 = t.range * t.range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      let score = e.dist;
      if (t.type === "frost" && !e.slowed && e.type !== "boss") score += 200; // prefer fresh targets
      if (t.type === "rail" && e.type === "boss") score += 500;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private fire(t: Tower, e: Enemy): void {
    const def = TOWERS[t.type];
    t.cool = 1 / t.rate;
    t.recoil = 1;
    t.muzzle = 0.1;

    if (t.type === "rail") {
      this.damageEnemy(e, t.dmg, t);
      if (e.alive) this.particles.spark(e.x, e.y, t.angle + Math.PI, def.color, 8);
      this.beams.push({ x1: t.x + Math.cos(t.angle) * 14, y1: t.y + Math.sin(t.angle) * 14, x2: e.x, y2: e.y, life: 0.14, max: 0.14, color: def.color });
      if (this.beams.length > 24) this.beams.shift();
      this.particles.spark(e.x, e.y, t.angle, "#fdf4ff", 4);
      this.particles.text(e.x, e.y - e.radius - 8, `${t.dmg}`, "#f0abfc", 13);
      this.audio.play("rail", 70);
      if (t.level >= 3) this.trauma = Math.min(1, this.trauma + 0.06);
      return;
    }

    if (t.type === "frost") {
      this.damageEnemy(e, t.dmg, t);
      if (e.alive) {
        e.slowUntil = this.time + t.slowDur;
        e.slowFactor = 1 - t.slow;
        if (t.level >= 3) {
          for (const o of this.enemies) {
            if (!o.alive || o === e) continue;
            const dx = o.x - e.x, dy = o.y - e.y;
            if (dx * dx + dy * dy < 55 * 55) {
              o.slowUntil = this.time + t.slowDur * 0.7;
              o.slowFactor = 1 - t.slow * 0.8;
            }
          }
          this.particles.ring(e.x, e.y, def.color, 6, 55, 0.4, 2);
        }
      }
      this.beams.push({ x1: t.x + Math.cos(t.angle) * 12, y1: t.y + Math.sin(t.angle) * 12, x2: e.x, y2: e.y, life: 0.09, max: 0.09, color: "#93c5fd" });
      if (this.beams.length > 24) this.beams.shift();
      this.particles.burst(e.x, e.y, "#bfdbfe", 6, 70, 3.4, 0.4);
      this.particles.spark(e.x, e.y, t.angle + Math.PI, def.color, 3);
      this.audio.play("frost", 90);
      return;
    }

    // spawn projectile (pulse homing / mortar lob)
    let p = this.projs.find((x) => !x.alive);
    if (!p) {
      if (this.projs.length >= 220) return;
      p = {
        alive: false, kind: "pulse", x: 0, y: 0, px: 0, py: 0,
        target: e, tx: 0, ty: 0, speed: 0, dmg: 0, aoe: 0,
        src: null, flight: 0, flightT: 0, color: "#fff",
      };
      this.projs.push(p);
    }
    p.alive = true;
    p.kind = t.type === "mortar" ? "mortar" : "pulse";
    p.x = t.x + Math.cos(t.angle) * 16;
    p.y = t.y + Math.sin(t.angle) * 16;
    p.px = p.x; p.py = p.y;
    p.target = e;
    p.tx = e.x; p.ty = e.y;
    p.dmg = t.dmg;
    p.aoe = t.aoe;
    p.src = t;
    p.color = def.color;
    if (p.kind === "mortar") {
      p.speed = 330;
      p.flight = Math.hypot(e.x - p.x, e.y - p.y) / p.speed;
      p.flight = Math.max(0.32, Math.min(1.1, p.flight));
      p.flightT = 0;
      this.audio.play("mortar", 80);
      this.particles.burst(p.x, p.y, "#fde68a", 4, 60, 3, 0.25);
    } else {
      p.speed = 470;
      p.flight = 0; p.flightT = 0;
      this.audio.play("shoot", 45);
      this.particles.spark(p.x, p.y, t.angle, def.color, 2);
    }
  }

  // ── update ───────────────────────────────────────────────

  private update(dt: number, rdt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - rdt * 1.25);
    this.leakFlash = Math.max(0, this.leakFlash - rdt * 1.6);
    if (this.banner.t < this.banner.max) this.banner.t += dt;

    // ambient motes (menu + intermission life)
    this.ambientT += dt;
    const ambientRate = this.phase === "menu" ? 0.22 : 1.4;
    if (this.ambientT > ambientRate) {
      this.ambientT = 0;
      const colors = ["#22d3ee", "#e879f9", "#6366f1"];
      this.particles.burst(rand(0, VIEW_W), rand(0, VIEW_H), colors[Math.floor(Math.random() * 3)], 1, 8, 2.2, 3.2, -4);
    }

    if (this.phase === "menu") {
      this.particles.update(dt);
      return;
    }

    // wave machine
    if (this.phase === "playing") {
      if (this.waveState === "intermission") {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startWave();
      } else if (this.waveState === "active") {
        this.waveTime += dt;
        while (this.qIdx < this.queue.length && this.queue[this.qIdx].at <= this.waveTime) {
          this.spawn(this.queue[this.qIdx].type);
          this.qIdx++;
        }
        if (this.qIdx >= this.queue.length && this.aliveCount === 0) {
          this.waveCleared();
        }
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.slowed = this.time < e.slowUntil;
      const sp = e.speed * (e.slowed ? e.slowFactor : 1);
      e.dist += sp * dt;
      e.flash = Math.max(0, e.flash - dt);
      e.wob += dt;
      e.spawnT += dt;
      if (e.dist >= this.leakDist) {
        this.leak(e);
        continue;
      }
      this.placeOnPath(e);
    }

    // towers
    if (this.phase === "playing") {
      for (const t of this.towers) {
        t.cool -= dt;
        t.recoil = Math.max(0, t.recoil - dt * 7);
        t.muzzle = Math.max(0, t.muzzle - dt);

        if (!t.target || !t.target.alive) t.target = this.acquire(t);
        else {
          const dx = t.target.x - t.x, dy = t.target.y - t.y;
          if (dx * dx + dy * dy > t.range * t.range) t.target = this.acquire(t);
        }
        if (t.target) {
          const desired = Math.atan2(t.target.y - t.y, t.target.x - t.x);
          t.angle = turnTowards(t.angle, desired, 14 * dt);
          if (t.cool <= 0) this.fire(t, t.target);
        }
      }
    }

    // projectiles
    for (const p of this.projs) {
      if (!p.alive) continue;
      if (p.kind === "pulse") {
        if (p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        p.px = p.x; p.py = p.y;
        if (d <= step + (p.target.alive ? p.target.radius * 0.5 : 0)) {
          p.alive = false;
          if (p.target.alive) {
            this.damageEnemy(p.target, p.dmg, p.src);
            this.particles.burst(p.tx, p.ty, p.color, 3, 90, 2.6, 0.22);
          }
        } else {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
          if (p.x < -60 || p.x > VIEW_W + 60 || p.y < -60 || p.y > VIEW_H + 60) p.alive = false;
        }
      } else {
        // mortar lob
        p.flightT += dt;
        const k = Math.min(1, p.flightT / p.flight);
        p.px = p.x; p.py = p.y;
        if (p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
        // ease toward target point
        p.x = p.x + (p.tx - p.x) * Math.min(1, dt * (3 + 10 * k));
        p.y = p.y + (p.ty - p.y) * Math.min(1, dt * (3 + 10 * k));
        if (Math.random() < 0.35) this.particles.burst(p.x, p.y, "#fde68a", 1, 6, 2, 0.28);
        if (k >= 1 || Math.hypot(p.tx - p.x, p.ty - p.y) < 8) {
          p.alive = false;
          this.mortarHit(p);
        }
      }
    }

    // beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }

    this.particles.update(dt);

    // hud
    this.hudTimer -= rdt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.09;
      this.pushHud();
    }
  }

  private mortarHit(p: Proj): void {
    const r = p.aoe;
    this.particles.burst(p.tx, p.ty, "#fbbf24", 16, 190, 5, 0.45, 40);
    this.particles.ring(p.tx, p.ty, "#fbbf24", 4, r * 1.25, 0.4, 3.5);
    this.particles.ring(p.tx, p.ty, "#fff7ed", 2, r * 0.7, 0.25, 2);
    this.audio.play("boom", 70);
    this.trauma = Math.min(1, this.trauma + 0.1);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.tx, dy = e.y - p.ty;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r) {
        const falloff = 1 - (Math.sqrt(d2) / r) * 0.45;
        this.damageEnemy(e, Math.round(p.dmg * falloff), p.src);
      }
    }
  }

  private setBanner(title: string, sub: string, color: string, dur: number): void {
    this.banner.title = title;
    this.banner.sub = sub;
    this.banner.color = color;
    this.banner.t = 0;
    this.banner.max = dur;
  }

  private pushHud(): void {
    if (this.destroyed) return;
    this.cb.onHud({
      phase: this.phase,
      gold: this.gold,
      lives: this.lives,
      maxLives: MAX_LIVES,
      wave: this.waveState === "active" ? this.wave : this.wave + 1,
      score: this.score,
      kills: this.kills,
      enemiesLeft: this.aliveCount + (this.queue.length - this.qIdx),
      speed: this.timeScale,
      intermission: this.waveState === "intermission" ? Math.max(0, this.waveTimer) : 0,
      muted: this.audio.muted,
    });
  }

  // ── render ───────────────────────────────────────────────

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#03040b";
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // shake
    const amp = this.trauma * this.trauma * 13;
    const shx = (Math.random() * 2 - 1) * amp;
    const shy = (Math.random() * 2 - 1) * amp;

    ctx.save();
    ctx.translate(this.ox + shx, this.oy + shy);
    ctx.scale(this.scale, this.scale);

    if (this.bg) {
      ctx.drawImage(this.bg, -MARGIN, -MARGIN, VIEW_W + MARGIN * 2, VIEW_H + MARGIN * 2);
    }

    this.drawPathEnergy(ctx);
    this.drawPortalCore(ctx);

    const playing = this.phase === "playing";
    if (playing) {
      this.drawPreviews(ctx);
    }
    if (this.phase !== "menu") {
      this.drawTowers(ctx);
      this.drawEnemies(ctx);
      this.drawProjs(ctx);
      this.drawBeams(ctx);
    }
    this.particles.draw(ctx);
    if (this.phase !== "menu") this.drawBanner(ctx);

    // leak flash / low lives
    const low = this.phase === "playing" && this.lives <= 5 ? 0.06 + Math.sin(this.time * 6) * 0.035 : 0;
    const flash = this.leakFlash * 0.13 + low;
    if (flash > 0.003) {
      ctx.fillStyle = `rgba(239,68,68,${flash.toFixed(3)})`;
      ctx.fillRect(-MARGIN, -MARGIN, VIEW_W + MARGIN * 2, VIEW_H + MARGIN * 2);
    }

    ctx.restore();
  }

  private tracePath(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.pts[0].x, this.pts[0].y);
    for (let i = 1; i < this.pts.length; i++) ctx.lineTo(this.pts[i].x, this.pts[i].y);
  }

  private drawPathEnergy(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([9, 26]);
    ctx.lineDashOffset = -this.time * 120;
    ctx.strokeStyle = "rgba(56,225,255,0.5)";
    ctx.lineWidth = 3;
    this.tracePath(ctx);
    ctx.stroke();
    ctx.setLineDash([3, 42]);
    ctx.lineDashOffset = -this.time * 70;
    ctx.strokeStyle = "rgba(232,121,249,0.35)";
    ctx.lineWidth = 1.6;
    this.tracePath(ctx);
    ctx.stroke();
    ctx.restore();
  }

  private drawPortalCore(ctx: CanvasRenderingContext2D): void {
    const start = this.pts[0];
    const end = this.pts[this.pts.length - 1];
    const portalPulse = 1 + Math.sin(this.time * 3.1) * 0.1;
    drawSprite(ctx, this.portalSpr, start.x + CELL * 0.5, start.y, this.time * 0.5, portalPulse, 0.95);

    const corePulse = 1 + Math.sin(this.time * 2.4) * 0.07 + this.leakFlash * 0.25;
    drawSprite(ctx, this.coreSpr, end.x - CELL * 0.9, end.y, -this.time * 0.35, corePulse);
    if (Math.random() < 0.08) {
      this.particles.burst(end.x - CELL * 0.9, end.y, "#34d399", 1, 14, 2, 0.9);
    }
    if (this.leakFlash > 0.05) {
      const g = glowSprite("#ef4444");
      ctx.globalAlpha = this.leakFlash * 0.8;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(g, end.x - CELL * 0.9 - 34, end.y - 34, 68, 68);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  private drawPreviews(ctx: CanvasRenderingContext2D): void {
    // hovered / cursored cell with range preview
    const cell = this.hover.active ? this.hover : this.cursor.active ? this.cursor : null;
    if (this.buildType && cell) {
      const gx = cell.gx, gy = cell.gy;
      const cx = (gx + 0.5) * CELL;
      const cy = (gy + 0.5) * CELL;
      const def = TOWERS[this.buildType];
      const blocked = this.pathMask[gy * COLS + gx] || !!this.occ[gy * COLS + gx] || this.gold < def.cost;
      const color = blocked ? "#ef4444" : def.color;

      ctx.save();
      ctx.globalAlpha = blocked ? 0.05 : 0.09;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, def.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([7, 9]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = blocked ? 0.16 : 0.24;
      ctx.fillRect(gx * CELL + 2, gy * CELL + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(gx * CELL + 1, gy * CELL + 1, CELL - 2, CELL - 2);
      ctx.restore();

      // ghost
      drawSprite(ctx, this.tHead[this.buildType], cx, cy, 0, 1, blocked ? 0.3 : 0.75);
    }

    // keyboard cursor brackets
    if (this.cursor.active) {
      const x = this.cursor.gx * CELL;
      const y = this.cursor.gy * CELL;
      const s = 5 + Math.sin(this.time * 5) * 1.5;
      ctx.save();
      ctx.strokeStyle = "rgba(125,231,255,0.95)";
      ctx.lineWidth = 2;
      const l = 9;
      const corner = (cx: number, cy: number, dx: number, dy: number) => {
        ctx.beginPath();
        ctx.moveTo(cx + dx * l, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + dy * l);
        ctx.stroke();
      };
      corner(x + s - 3, y + s - 3, 1, 1);
      corner(x + CELL - s + 3, y + s - 3, -1, 1);
      corner(x + s - 3, y + CELL - s + 3, 1, -1);
      corner(x + CELL - s + 3, y + CELL - s + 3, -1, -1);
      ctx.restore();
    }

    // inspected tower range
    if (this.inspectId !== null) {
      const t = this.towers.find((x) => x.id === this.inspectId);
      if (t) {
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = this.time * 24;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawTowers(ctx: CanvasRenderingContext2D): void {
    for (const t of this.towers) {
      const def = TOWERS[t.type];
      drawSprite(ctx, this.tBase[t.type], t.x, t.y, 0, 1);
      const recoil = t.recoil * 3.2;
      const hx = t.x - Math.cos(t.angle) * recoil;
      const hy = t.y - Math.sin(t.angle) * recoil;
      const headRot = t.type === "frost" ? this.time * 1.4 + t.gx * 0.6 : t.angle;
      drawSprite(ctx, this.tHead[t.type], hx, hy, headRot, 1 + t.recoil * 0.06);
      if (t.muzzle > 0) {
        const g = glowSprite(def.color);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = t.muzzle / 0.1;
        const mx = t.x + Math.cos(t.angle) * 20;
        const my = t.y + Math.sin(t.angle) * 20;
        ctx.drawImage(g, mx - 9, my - 9, 18, 18);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      // level pips
      for (let i = 0; i < t.level; i++) {
        ctx.fillStyle = hexToRgba(def.color, 0.95);
        ctx.beginPath();
        ctx.arc(t.x - (t.level - 1) * 4 + i * 8, t.y + CELL * 0.34, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const spr = this.eSpr[e.type];
      const pop = Math.min(1, e.spawnT / 0.16);
      const scale = (0.4 + 0.6 * pop) * (e.type === "splitter" ? 1 + Math.sin(e.wob * 9) * 0.06 : 1);
      const hoverY = e.type === "boss" ? Math.sin(e.wob * 2.2) * 2 : Math.sin(e.wob * 7) * 0.8;
      const rot = e.type === "grunt" ? e.wob * 0.9 : e.type === "tank" ? e.wob * 0.4 : e.type === "boss" ? e.wob * 0.5 : e.angle;

      drawSprite(ctx, spr, e.x, e.y + hoverY, rot, scale);

      if (e.flash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, e.flash * 9);
        const s = e.radius * 2.4;
        ctx.drawImage(glowSprite("#ffffff"), e.x - s / 2, e.y + hoverY - s / 2, s, s);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      if (e.slowed) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.4;
        const s = e.radius * 3;
        ctx.drawImage(glowSprite("#93c5fd"), e.x - s / 2, e.y + hoverY - s / 2, s, s);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      // hp bar
      if (e.hp < e.maxHp) {
        const w = e.radius * 2;
        const h = 3;
        const x = e.x - w / 2;
        const y = e.y + hoverY - e.radius - 8;
        ctx.fillStyle = "rgba(6,8,18,0.8)";
        ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
        const k = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = k > 0.5 ? "#4ade80" : k > 0.25 ? "#facc15" : "#f87171";
        ctx.fillRect(x, y, w * k, h);
      }
    }
  }

  private drawProjs(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.projs) {
      if (!p.alive) continue;
      if (p.kind === "pulse") {
        ctx.strokeStyle = hexToRgba(p.color, 0.55);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.drawImage(glowSprite(p.color), p.x - 6, p.y - 6, 12, 12);
        ctx.drawImage(glowSprite("#ffffff"), p.x - 2.6, p.y - 2.6, 5.2, 5.2);
      } else {
        const k = Math.min(1, p.flightT / p.flight);
        const arc = Math.sin(k * Math.PI) * 22;
        ctx.drawImage(glowSprite(p.color), p.x - 8, p.y - arc - 8, 16, 16);
        ctx.drawImage(glowSprite("#fff7ed"), p.x - 3, p.y - arc - 3, 6, 6);
        // shadow
        ctx.globalAlpha = 0.25;
        ctx.drawImage(glowSprite("#000000"), p.x - 5, p.y - 5, 10, 10);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawBeams(ctx: CanvasRenderingContext2D): void {
    if (!this.beams.length) return;
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.beams) {
      const a = b.life / b.max;
      ctx.strokeStyle = hexToRgba(b.color, 0.5 * a);
      ctx.lineWidth = 6.5 * a + 1;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba("#ffffff", 0.9 * a);
      ctx.lineWidth = 1.8 * a + 0.5;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    const b = this.banner;
    if (b.t >= b.max || !b.title) return;
    const p = b.t / b.max;
    const alpha = p < 0.12 ? p / 0.12 : p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
    const pop = 1 + Math.max(0, 0.14 - p) * 2.2;
    const y = VIEW_H * 0.3;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${Math.round(32 * pop)}px Orbitron, sans-serif`;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = b.color;
    ctx.fillText(b.title, VIEW_W / 2, y);
    ctx.shadowBlur = 0;
    // underline sweep
    const uw = 180 * Math.min(1, p * 5);
    const grad = ctx.createLinearGradient(VIEW_W / 2 - uw, y, VIEW_W / 2 + uw, y);
    grad.addColorStop(0, hexToRgba(b.color, 0));
    grad.addColorStop(0.5, hexToRgba(b.color, 0.9));
    grad.addColorStop(1, hexToRgba(b.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(VIEW_W / 2 - uw, y + 24, uw * 2, 2);
    if (b.sub) {
      ctx.font = "600 14px Rajdhani, sans-serif";
      ctx.fillStyle = "#dbeafe";
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillText(b.sub.toUpperCase(), VIEW_W / 2, y + 44);
    }
    ctx.restore();
  }
}
