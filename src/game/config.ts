// ─────────────────────────────────────────────────────────────
// NEON SIEGE — balance & world configuration
// ─────────────────────────────────────────────────────────────

export const COLS = 16;
export const ROWS = 10;
export const CELL = 48;
export const VIEW_W = COLS * CELL; // 768
export const VIEW_H = ROWS * CELL; // 480

/** Path waypoints in grid-cell coords (center-based). Off-grid ends = spawn/exit. */
export const PATH_WAYPOINTS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [13, 1],
  [13, 3],
  [2, 3],
  [2, 5],
  [13, 5],
  [13, 7],
  [2, 7],
  [2, 9],
  [16, 9],
];

export const START_GOLD = 110;
export const START_LIVES = 20;
export const MAX_LIVES = 25;
export const FIRST_INTERMISSION = 5;
export const INTERMISSION = 12;

// ── Towers ───────────────────────────────────────────────────

export type TowerType = "pulse" | "rail" | "frost" | "mortar";
export const TOWER_ORDER: TowerType[] = ["pulse", "rail", "frost", "mortar"];

export interface TowerDef {
  name: string;
  tag: string;
  cost: number;
  color: string;
  dmg: number;
  rate: number; // shots per second
  range: number; // logical px
  aoe?: number;
  slow?: number; // fraction removed, e.g. 0.45 → target moves at 55%
  slowDur?: number;
  desc: string;
}

export const TOWERS: Record<TowerType, TowerDef> = {
  pulse: {
    name: "Pulse",
    tag: "DPS",
    cost: 25,
    color: "#22d3ee",
    dmg: 8,
    rate: 2.4,
    range: 125,
    desc: "Rapid fire, cheap and reliable.",
  },
  rail: {
    name: "Railgun",
    tag: "BURST",
    cost: 60,
    color: "#e879f9",
    dmg: 42,
    rate: 0.8,
    range: 182,
    desc: "Long-range beam. Deletes stragglers.",
  },
  frost: {
    name: "Cryo",
    tag: "SLOW",
    cost: 45,
    color: "#60a5fa",
    dmg: 5,
    rate: 1.1,
    range: 122,
    slow: 0.45,
    slowDur: 1.5,
    desc: "Chills enemies, holding them in kill-zones.",
  },
  mortar: {
    name: "Mortar",
    tag: "AOE",
    cost: 75,
    color: "#fbbf24",
    dmg: 18,
    rate: 0.9,
    range: 152,
    aoe: 56,
    desc: "Lobs shells that splash whole packs.",
  },
};

export const MAX_LEVEL = 3;

export const DMG_MUL = [1, 1.55, 2.4];
export const RATE_MUL = [1, 1.12, 1.25];
export const RANGE_MUL = [1, 1.06, 1.13];

export function upgradeCost(type: TowerType, level: number): number {
  // level 1→2, 2→3
  const base = TOWERS[type].cost;
  return Math.round(base * (level === 1 ? 1.0 : 1.8));
}

export function sellValue(invested: number): number {
  return Math.floor(invested * 0.7);
}

// ── Enemies ──────────────────────────────────────────────────

export type EnemyType = "grunt" | "runner" | "tank" | "splitter" | "boss";

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number; // logical px/s
  radius: number;
  bounty: number;
  score: number;
  lifeCost: number;
  color: string;
  hint: string;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  grunt: {
    name: "GRUNT",
    hp: 44,
    speed: 80,
    radius: 11,
    bounty: 6,
    score: 10,
    lifeCost: 1,
    color: "#fb923c",
    hint: "standard swarm unit",
  },
  runner: {
    name: "RUNNER",
    hp: 30,
    speed: 138,
    radius: 9,
    bounty: 7,
    score: 12,
    lifeCost: 1,
    color: "#facc15",
    hint: "fast & fragile",
  },
  tank: {
    name: "TANK",
    hp: 230,
    speed: 52,
    radius: 15,
    bounty: 15,
    score: 30,
    lifeCost: 2,
    color: "#ef4444",
    hint: "slow armored bruiser",
  },
  splitter: {
    name: "SPLITTER",
    hp: 82,
    speed: 88,
    radius: 13,
    bounty: 13,
    score: 25,
    lifeCost: 1,
    color: "#f472b6",
    hint: "splits into runners",
  },
  boss: {
    name: "OVERLORD",
    hp: 1500,
    speed: 42,
    radius: 23,
    bounty: 130,
    score: 300,
    lifeCost: 5,
    color: "#ff2d78",
    hint: "massive hive-mind",
  },
};

// ── Wave scaling ─────────────────────────────────────────────

export function hpMul(wave: number): number {
  const n = wave - 1;
  return 1 + n * 0.24 + Math.pow(n, 1.65) * 0.02;
}
export function speedMul(wave: number): number {
  return Math.min(1 + (wave - 1) * 0.018, 1.3);
}
export function bountyMul(wave: number): number {
  return 1 + (wave - 1) * 0.04;
}
export function scoreMul(wave: number): number {
  return 1 + wave * 0.1;
}
