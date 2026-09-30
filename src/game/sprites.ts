import { hexToRgba } from "./util";

// ─────────────────────────────────────────────────────────────
// Pre-rendered glow/shape sprites.
// All shadowBlur work happens ONCE here at build time, so the
// per-frame path is pure drawImage — the key to stable 60fps.
// ─────────────────────────────────────────────────────────────

const SS = 3; // supersample factor

export interface Sprite {
  cv: HTMLCanvasElement;
  size: number; // logical bounding box (square)
}

export function makeSprite(size: number, draw: (ctx: CanvasRenderingContext2D, c: number) => void): Sprite {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(size * SS);
  cv.height = Math.ceil(size * SS);
  const ctx = cv.getContext("2d")!;
  ctx.scale(SS, SS);
  draw(ctx, size / 2);
  return { cv, size };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  rot = 0,
  scale = 1,
  alpha = 1
): void {
  const half = (s.size * scale) / 2;
  ctx.globalAlpha = alpha;
  if (rot === 0) {
    ctx.drawImage(s.cv, x - half, y - half, s.size * scale, s.size * scale);
  } else {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(s.cv, -half, -half, s.size * scale, s.size * scale);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ── cached soft glow dots (particles, projectiles, flashes) ──

const glowCache = new Map<string, HTMLCanvasElement>();

export function glowSprite(color: string): HTMLCanvasElement {
  let cv = glowCache.get(color);
  if (cv) return cv;
  cv = document.createElement("canvas");
  cv.width = 48;
  cv.height = 48;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, hexToRgba(color, 0.9));
  g.addColorStop(0.35, hexToRgba(color, 0.38));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  glowCache.set(color, cv);
  return cv;
}

// ── polygons ─────────────────────────────────────────────────

function poly(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, rOut: number, rIn: number, points: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ── enemies ──────────────────────────────────────────────────

export function enemySprite(kind: string, color: string, radius: number): Sprite {
  const size = radius * 2 + 30;
  return makeSprite(size, (ctx, c) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;

    if (kind === "grunt") {
      ctx.fillStyle = color;
      poly(ctx, c, c, radius, 4, Math.PI / 4 + 0.6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(8,10,20,0.85)";
      poly(ctx, c, c, radius * 0.6, 4, -0.2);
      ctx.fill();
      ctx.fillStyle = "#fff7ed";
      ctx.beginPath();
      ctx.arc(c, c, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "runner") {
      ctx.fillStyle = color;
      poly(ctx, c, c, radius, 3, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(8,10,20,0.8)";
      poly(ctx, c, c, radius * 0.5, 3, 0);
      ctx.fill();
      ctx.fillStyle = "#fefce8";
      poly(ctx, c + radius * 0.28, c, radius * 0.2, 3, 0);
      ctx.fill();
    } else if (kind === "tank") {
      ctx.fillStyle = color;
      poly(ctx, c, c, radius, 6, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(8,10,20,0.9)";
      ctx.lineWidth = 3;
      poly(ctx, c, c, radius * 0.62, 6, 0.4);
      ctx.stroke();
      ctx.fillStyle = "#fecaca";
      ctx.beginPath();
      ctx.arc(c, c, radius * 0.26, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "splitter") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(8,10,20,0.75)";
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * radius * 0.42, c + Math.sin(a) * radius * 0.42, radius * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fdf2f8";
      ctx.beginPath();
      ctx.arc(c, c, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // boss
      ctx.fillStyle = color;
      star(ctx, c, c, radius, radius * 0.55, 6, 0);
      ctx.fill();
      ctx.shadowBlur = 22;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.4;
      star(ctx, c, c, radius * 0.92, radius * 0.5, 6, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(8,10,20,0.85)";
      ctx.beginPath();
      ctx.arc(c, c, radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff1f2";
      ctx.beginPath();
      ctx.arc(c, c, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ── towers ───────────────────────────────────────────────────

export function towerBaseSprite(color: string): Sprite {
  return makeSprite(46, (ctx, c) => {
    ctx.shadowColor = hexToRgba(color, 0.9);
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#0b1124";
    poly(ctx, c, c, 15, 8, Math.PI / 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 1.6;
    poly(ctx, c, c, 15, 8, Math.PI / 8);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(color, 0.16);
    poly(ctx, c, c, 12, 8, Math.PI / 8);
    ctx.fill();
  });
}

export function towerHeadSprite(kind: string, color: string): Sprite {
  const size = 44;
  return makeSprite(size, (ctx, c) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#101a38";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;

    if (kind === "pulse") {
      ctx.beginPath();
      ctx.arc(c, c, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // twin barrels
      ctx.fillStyle = color;
      ctx.fillRect(c + 6, c - 5.5, 12, 3.4);
      ctx.fillRect(c + 6, c + 2.1, 12, 3.4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#e0faff";
      ctx.beginPath();
      ctx.arc(c, c, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "rail") {
      ctx.beginPath();
      ctx.arc(c, c, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(c + 4, c - 2.4, 20, 4.8);
      ctx.fillRect(c + 13, c - 4.4, 3, 8.8);
      ctx.fillRect(c + 19, c - 4.4, 3, 8.8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fdf4ff";
      ctx.beginPath();
      ctx.arc(c, c, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "frost") {
      ctx.fillStyle = "#0e1630";
      poly(ctx, c, c, 10.5, 6, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      poly(ctx, c, c, 6, 6, Math.PI / 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#eff6ff";
      poly(ctx, c, c, 2.6, 6, 0);
      ctx.fill();
    } else {
      // mortar
      ctx.fillStyle = "#141124";
      ctx.beginPath();
      ctx.arc(c, c, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(c + 2, c - 4.6, 14, 9.2);
      ctx.beginPath();
      ctx.arc(c + 16, c, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fffbeb";
      ctx.beginPath();
      ctx.arc(c, c, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ── core & portal ────────────────────────────────────────────

export function coreSprite(): Sprite {
  return makeSprite(84, (ctx, c) => {
    ctx.shadowColor = "#34d399";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "rgba(6,20,16,0.9)";
    poly(ctx, c, c, 20, 6, Math.PI / 6);
    ctx.fill();
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2.2;
    poly(ctx, c, c, 20, 6, Math.PI / 6);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(52,211,153,0.5)";
    ctx.lineWidth = 1.2;
    poly(ctx, c, c, 26, 6, Math.PI / 6);
    ctx.stroke();
    const g = ctx.createRadialGradient(c, c, 0, c, c, 13);
    g.addColorStop(0, "#d1fae5");
    g.addColorStop(0.45, "#34d399");
    g.addColorStop(1, "rgba(52,211,153,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 13, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function portalSprite(): Sprite {
  return makeSprite(74, (ctx, c) => {
    ctx.shadowColor = "#f472b6";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "rgba(244,114,182,0.9)";
    ctx.lineWidth = 2.4;
    poly(ctx, c, c, 17, 6, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(244,114,182,0.4)";
    ctx.lineWidth = 1.4;
    poly(ctx, c, c, 23, 6, Math.PI / 6);
    ctx.stroke();
    const g = ctx.createRadialGradient(c, c, 0, c, c, 16);
    g.addColorStop(0, "rgba(253,164,175,0.9)");
    g.addColorStop(0.5, "rgba(244,114,182,0.35)");
    g.addColorStop(1, "rgba(244,114,182,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 16, 0, Math.PI * 2);
    ctx.fill();
  });
}
