import { glowSprite } from "./sprites";
import { rand } from "./util";

// ─────────────────────────────────────────────────────────────
// Pooled particle / ring / floating-text system.
// Zero allocation in the hot path — ring buffers with reuse.
// ─────────────────────────────────────────────────────────────

interface P {
  alive: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number; max: number;
  size: number;
  drag: number;
  grav: number;
  color: string;
}

interface Ring {
  alive: boolean;
  x: number; y: number;
  r0: number; r1: number;
  life: number; max: number;
  color: string;
  width: number;
}

interface FText {
  alive: boolean;
  x: number; y: number;
  vy: number;
  life: number; max: number;
  text: string;
  color: string;
  size: number;
}

const MAX_P = 640;
const MAX_R = 48;
const MAX_T = 40;

export class Particles {
  private parts: P[] = [];
  private rings: Ring[] = [];
  private texts: FText[] = [];
  private pi = 0;
  private ri = 0;
  private ti = 0;

  constructor() {
    for (let i = 0; i < MAX_P; i++) {
      this.parts.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, drag: 0.9, grav: 0, color: "#fff" });
    }
    for (let i = 0; i < MAX_R; i++) {
      this.rings.push({ alive: false, x: 0, y: 0, r0: 0, r1: 1, life: 0, max: 1, color: "#fff", width: 2 });
    }
    for (let i = 0; i < MAX_T; i++) {
      this.texts.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: "", color: "#fff", size: 12 });
    }
  }

  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    size: number,
    life: number,
    grav = 0
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.pi];
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = life * (0.55 + Math.random() * 0.7);
      p.life = p.max;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.drag = 0.9;
      p.grav = grav;
      p.color = color;
      this.pi = (this.pi + 1) % MAX_P;
    }
  }

  spark(x: number, y: number, angle: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.pi];
      const a = angle + rand(-0.45, 0.45);
      const s = rand(90, 260);
      p.alive = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = rand(0.12, 0.3);
      p.life = p.max;
      p.size = rand(2, 5);
      p.drag = 0.86;
      p.grav = 0;
      p.color = color;
      this.pi = (this.pi + 1) % MAX_P;
    }
  }

  ring(x: number, y: number, color: string, r0: number, r1: number, life: number, width = 3): void {
    const r = this.rings[this.ri];
    r.alive = true;
    r.x = x; r.y = y;
    r.r0 = r0; r.r1 = r1;
    r.max = life; r.life = life;
    r.color = color;
    r.width = width;
    this.ri = (this.ri + 1) % MAX_R;
  }

  text(x: number, y: number, text: string, color: string, size = 13): void {
    const t = this.texts[this.ti];
    t.alive = true;
    t.x = x; t.y = y;
    t.vy = -34;
    t.max = 0.85;
    t.life = 0.85;
    t.text = text;
    t.color = color;
    t.size = size;
    this.ti = (this.ti + 1) % MAX_T;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_P; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = 0; i < MAX_R; i++) {
      const r = this.rings[i];
      if (!r.alive) continue;
      r.life -= dt;
      if (r.life <= 0) r.alive = false;
    }
    for (let i = 0; i < MAX_T; i++) {
      const t = this.texts[i];
      if (!t.alive) continue;
      t.life -= dt;
      if (t.life <= 0) { t.alive = false; continue; }
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.9, dt * 60);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // additive glow layer
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < MAX_P; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      const a = p.life / p.max;
      const s = p.size * (0.5 + a * 0.5);
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
    }
    for (let i = 0; i < MAX_R; i++) {
      const r = this.rings[i];
      if (!r.alive) continue;
      const t = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 2.2));
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 0.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // floating texts
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < MAX_T; i++) {
      const t = this.texts[i];
      if (!t.alive) continue;
      const a = Math.min(1, t.life / (t.max * 0.55));
      const pop = t.life > t.max - 0.12 ? 1 + (t.life - (t.max - 0.12)) * 2.4 : 1;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(t.size * pop)}px Rajdhani, sans-serif`;
      ctx.strokeStyle = "rgba(3,4,12,0.85)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.parts) p.alive = false;
    for (const r of this.rings) r.alive = false;
    for (const t of this.texts) t.alive = false;
  }
}
