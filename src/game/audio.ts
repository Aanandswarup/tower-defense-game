import { getMuted, setMutedPref } from "./storage";

// ─────────────────────────────────────────────────────────────
// Fully procedural audio: SFX + adaptive music via WebAudio.
// No audio assets — tiny footprint, zero network.
// ─────────────────────────────────────────────────────────────

type OscType = "sine" | "square" | "sawtooth" | "triangle";

const CHORDS: number[][] = [
  [110.0, 164.81, 220.0, 261.63, 329.63], // Am
  [87.31, 130.81, 174.61, 220.0, 261.63], // F
  [98.0, 146.83, 196.0, 246.94, 293.66], // G
  [82.41, 123.47, 164.81, 207.65, 246.94], // E-ish color
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay: Record<string, number> = {};

  muted: boolean = getMuted();
  intensity = 0.6; // 0.4 menu · 1 waves · 1.5 boss

  private seqTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(this.master);

      this.musBus = this.ctx.createGain();
      this.musBus.gain.value = 0.16;
      this.musBus.connect(this.master);

      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.startSequencer();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    setMutedPref(m);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
  }

  // ── SFX primitives ────────────────────────────────────────

  private blip(f0: number, f1: number, dur: number, type: OscType, vol: number, delay = 0): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, delay = 0): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(g).connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** rate-limited sfx dispatcher */
  play(name: string, throttleMs = 0): void {
    if (!this.ctx || this.muted) return;
    if (throttleMs > 0) {
      const now = performance.now();
      if (now - (this.lastPlay[name] ?? 0) < throttleMs) return;
      this.lastPlay[name] = now;
    }
    switch (name) {
      case "shoot":
        this.blip(880, 240, 0.07, "square", 0.055);
        break;
      case "rail":
        this.blip(190, 60, 0.2, "sawtooth", 0.14);
        this.noise(0.12, 0.06, 3000, 500);
        break;
      case "mortar":
        this.blip(240, 90, 0.14, "triangle", 0.16);
        break;
      case "frost":
        this.blip(1350, 1900, 0.1, "sine", 0.05);
        this.noise(0.09, 0.02, 6000, 2000);
        break;
      case "boom":
        this.noise(0.28, 0.2, 900, 90);
        this.blip(140, 45, 0.24, "sine", 0.18);
        break;
      case "bigboom":
        this.noise(0.6, 0.3, 700, 60);
        this.blip(110, 30, 0.55, "sine", 0.3);
        this.blip(220, 40, 0.4, "triangle", 0.12, 0.05);
        break;
      case "kill":
        this.blip(560, 180, 0.09, "square", 0.06);
        break;
      case "place":
        this.blip(340, 340, 0.05, "triangle", 0.16);
        this.blip(680, 680, 0.07, "triangle", 0.14, 0.05);
        break;
      case "deny":
        this.blip(200, 140, 0.09, "square", 0.09);
        this.blip(150, 110, 0.12, "square", 0.09, 0.08);
        break;
      case "upgrade":
        this.blip(440, 440, 0.07, "triangle", 0.14);
        this.blip(660, 660, 0.07, "triangle", 0.14, 0.07);
        this.blip(880, 880, 0.1, "triangle", 0.14, 0.14);
        break;
      case "sell":
        this.blip(660, 330, 0.12, "triangle", 0.12);
        break;
      case "leak":
        this.blip(130, 55, 0.3, "sawtooth", 0.2);
        this.noise(0.2, 0.1, 500, 120);
        break;
      case "wave":
        this.blip(220, 660, 0.3, "sawtooth", 0.08);
        this.blip(440, 880, 0.25, "triangle", 0.06, 0.1);
        break;
      case "boss":
        this.blip(98, 98, 0.4, "sawtooth", 0.22);
        this.blip(104, 104, 0.4, "sawtooth", 0.22, 0.28);
        break;
      case "gameover":
        this.blip(392, 392, 0.3, "triangle", 0.16);
        this.blip(311, 311, 0.3, "triangle", 0.16, 0.28);
        this.blip(233, 233, 0.55, "triangle", 0.18, 0.56);
        break;
      case "ui":
        this.blip(520, 520, 0.04, "triangle", 0.08);
        break;
    }
  }

  // ── music sequencer ───────────────────────────────────────

  private startSequencer(): void {
    if (!this.ctx || this.seqTimer !== null) return;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.seqTimer = window.setInterval(() => this.schedule(), 90);
  }

  private note(freq: number, dur: number, type: OscType, vol: number, when: number): void {
    if (!this.ctx || !this.musBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(this.musBus);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  private schedule(): void {
    if (!this.ctx || this.muted) {
      // keep clock moving so it resyncs cleanly on unmute
      if (this.ctx) {
        const now = this.ctx.currentTime;
        if (this.nextStepTime < now) {
          const stepDur = 0.24 / this.intensity;
          this.nextStepTime = now + stepDur;
          this.step++;
        }
      }
      return;
    }
    const now = this.ctx.currentTime;
    const stepDur = 0.24 / this.intensity;
    while (this.nextStepTime < now + 0.35) {
      const t = this.nextStepTime;
      const s = this.step;
      const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];

      // bass pulse every 4 steps
      if (s % 4 === 0) {
        this.note(chord[0] / 2, stepDur * 3.4, "sine", 0.5, t);
      }
      // arp pluck
      const arpNote = chord[[0, 2, 1, 3, 2, 4][s % 6]] * 2;
      if (s % 2 === 0) {
        this.note(arpNote, stepDur * 1.6, "triangle", 0.12 + this.intensity * 0.05, t);
      }
      // sparkle high note occasionally
      if (s % 16 === 8) {
        this.note(chord[4] * 4, stepDur * 5, "sine", 0.05, t);
      }
      // pad swell at chord change
      if (s % 16 === 0) {
        this.note(chord[1], stepDur * 14, "sine", 0.06, t);
        this.note(chord[2], stepDur * 14, "sine", 0.05, t + 0.02);
      }

      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  destroy(): void {
    if (this.seqTimer !== null) window.clearInterval(this.seqTimer);
    void this.ctx?.close();
  }
}
