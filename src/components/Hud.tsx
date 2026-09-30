import { Coins, FastForward, Heart, Pause, Play, Skull, Trophy, Volume2, VolumeX, Waves } from "lucide-react";
import type { HudState } from "../game/engine";

interface Props {
  hud: HudState;
  onSendWave: () => void;
  onToggleMute: () => void;
  onToggleSpeed: () => void;
  onPause: () => void;
}

export default function Hud({ hud, onSendWave, onToggleMute, onToggleSpeed, onPause }: Props) {
  const lowLives = hud.lives <= 5;
  return (
    <div className="relative z-20 flex flex-wrap items-center gap-1.5 px-2 py-1.5 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-2">
      {/* wave */}
      <div className="glass flex h-9 items-center gap-1.5 rounded-lg px-2 sm:h-10 sm:gap-2 sm:px-3.5">
        <Waves className="h-4 w-4 text-cyan-300" />
        <div className="flex items-baseline gap-1 leading-none sm:block">
          <span className="font-display text-[9px] tracking-[0.22em] text-slate-400">WAVE</span>
          <span className="font-display text-sm font-bold text-cyan-200 sm:text-lg">{hud.wave}</span>
        </div>
      </div>

      {/* score */}
      <div className="glass flex h-9 items-center gap-1.5 rounded-lg px-2 sm:h-10 sm:gap-2 sm:px-3.5">
        <Trophy className="h-4 w-4 text-amber-300" />
        <div key={hud.score} className="score-tick inline-block font-display text-sm font-bold text-white tabular-nums sm:text-base">
          {hud.score.toLocaleString()}
        </div>
      </div>

      <div className="hidden flex-1 sm:block" />

      {/* wave state pill */}
      {hud.intermission > 0 ? (
        <button
          onClick={onSendWave}
          className="group ml-auto flex h-9 items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 font-display text-[11px] font-bold tracking-widest text-emerald-300 transition-all hover:bg-emerald-400/20 hover:shadow-[0_0_18px_rgba(52,211,153,0.35)] active:scale-95 sm:ml-0 sm:h-10 sm:px-4"
        >
          <Play className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">SEND WAVE</span>
          <span className="tabular-nums">{Math.ceil(hud.intermission)}s</span>
          <span className="keycap hidden md:inline-flex">SPC</span>
        </button>
      ) : (
        <div className="glass ml-auto flex h-9 items-center gap-1.5 rounded-lg px-2.5 sm:ml-0 sm:h-10 sm:gap-2 sm:px-3">
          <Skull className="h-4 w-4 text-rose-400" />
          <span className="font-display text-sm font-bold tabular-nums text-rose-200">{hud.enemiesLeft}</span>
        </div>
      )}

      {/* gold */}
      <div className="glass flex h-9 items-center gap-1.5 rounded-lg px-2 sm:h-10 sm:gap-2 sm:px-3.5">
        <Coins className="h-4 w-4 text-amber-300" />
        <span key={hud.gold} className="score-tick inline-block font-display text-sm font-bold tabular-nums text-amber-200 sm:text-lg">
          {hud.gold}
        </span>
      </div>

      {/* lives */}
      <div className={`glass flex h-9 items-center gap-1.5 rounded-lg px-2 sm:h-10 sm:gap-2 sm:px-3.5 ${lowLives ? "border-red-500/50" : ""}`}>
        <Heart className={`h-4 w-4 ${lowLives ? "animate-pulse fill-red-400 text-red-400" : "fill-rose-500 text-rose-500"}`} />
        <span className={`font-display text-sm font-bold tabular-nums sm:text-lg ${lowLives ? "text-red-300" : "text-rose-200"}`}>
          {hud.lives}
        </span>
      </div>

      {/* controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleSpeed}
          title="Game speed [F]"
          className={`glass flex h-9 w-11 items-center justify-center gap-0.5 rounded-lg transition-all active:scale-95 sm:h-10 sm:w-14 ${
            hud.speed === 2 ? "border-cyan-400/50 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.25)]" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FastForward className="h-3.5 w-3.5" />
          <span className="font-display text-[11px] font-bold">{hud.speed}x</span>
        </button>
        <button
          onClick={onToggleMute}
          title="Sound [M]"
          className="glass flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:text-slate-200 active:scale-95 sm:h-10 sm:w-10"
        >
          {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          onClick={onPause}
          title="Pause [P]"
          className="glass flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-all hover:text-white active:scale-95 sm:h-10 sm:w-10"
        >
          {hud.phase === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
