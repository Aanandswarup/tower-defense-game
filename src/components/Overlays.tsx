import { useState } from "react";
import {
  Crown, Heart, Home, Keyboard, Play, RotateCcw, Skull, Smartphone,
  Trophy, Volume2, VolumeX,
} from "lucide-react";
import { getLastName, setLastName, type ScoreEntry } from "../game/storage";
import { TOWERS, TOWER_ORDER, type TowerType } from "../game/config";
import { TOWER_ICONS } from "./TowerBar";
import HighScores from "./HighScores";
import type { FinalStats } from "../game/engine";

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────

export function StartScreen({ scores, onStart }: { scores: ScoreEntry[]; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[#05060f]/55 backdrop-blur-[3px]">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-8">
        <div className="fade-up font-display text-[10px] font-bold tracking-[0.5em] text-cyan-400/90 sm:text-xs">
          TACTICAL DEFENSE PROTOCOL
        </div>
        <h1 className="fade-up fade-up-d1 title-glow float-slow mt-2 text-center font-display text-5xl font-black tracking-[0.08em] sm:text-7xl">
          NEON
          <span className="mx-2 sm:mx-3">SIEGE</span>
        </h1>
        <p className="fade-up fade-up-d2 mt-3 max-w-md text-center text-sm font-semibold leading-relaxed text-slate-400 sm:text-base">
          The swarm pours through the rift. Deploy <span className="text-cyan-300">towers</span>, hold the
          serpent path, and protect the <span className="text-emerald-300">core</span> — every wave hits harder.
        </p>

        <button
          onClick={onStart}
          className="btn-neon fade-up fade-up-d3 mt-6 flex items-center gap-3 rounded-xl px-10 py-4 text-base sm:text-lg"
        >
          <Play className="h-5 w-5 fill-current" />
          DEPLOY
          <span className="keycap !border-black/30 !bg-black/20 !text-[#06121a]">ENTER</span>
        </button>

        <div className="fade-up fade-up-d4 mt-8 grid w-full gap-3 sm:grid-cols-3">
          {/* arsenal */}
          <div className="glass rounded-2xl p-4">
            <div className="mb-3 font-display text-[10px] font-bold tracking-[0.3em] text-slate-400">ARSENAL</div>
            <div className="space-y-2.5">
              {TOWER_ORDER.map((t: TowerType) => {
                const def = TOWERS[t];
                const Icon = TOWER_ICONS[t];
                return (
                  <div key={t} className="flex items-start gap-2.5">
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${def.color}18`, boxShadow: `inset 0 0 0 1px ${def.color}55` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: def.color }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[11px] font-bold tracking-wider text-white">{def.name.toUpperCase()}</span>
                        <span className="font-display text-[10px] font-bold text-amber-300">{def.cost}g</span>
                      </div>
                      <div className="truncate text-[11px] leading-tight text-slate-500">{def.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* controls */}
          <div className="glass rounded-2xl p-4">
            <div className="mb-3 font-display text-[10px] font-bold tracking-[0.3em] text-slate-400">CONTROLS</div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-slate-500">
              <Keyboard className="h-3.5 w-3.5" /> DESKTOP
            </div>
            <table className="kbd-row w-full text-[11px] text-slate-300">
              <tbody>
                <tr><td><span className="keycap">1</span>–<span className="keycap">4</span></td><td>select tower</td></tr>
                <tr><td className="pr-2"><span className="keycap">CLICK</span></td><td>deploy / inspect</td></tr>
                <tr><td><span className="keycap">WASD</span></td><td>grid cursor</td></tr>
                <tr><td><span className="keycap">U</span> / <span className="keycap">X</span></td><td>upgrade / sell</td></tr>
                <tr><td><span className="keycap">SPC</span></td><td>send wave early</td></tr>
                <tr><td><span className="keycap">P</span> <span className="keycap">F</span> <span className="keycap">R</span></td><td>pause · speed · restart</td></tr>
              </tbody>
            </table>
            <div className="mb-2 mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-slate-500">
              <Smartphone className="h-3.5 w-3.5" /> TOUCH
            </div>
            <div className="text-[11px] leading-relaxed text-slate-300">
              Tap a tower card, then tap the grid. Tap any placed tower to upgrade or sell.
            </div>
          </div>

          {/* scores */}
          <div className="glass rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-1.5 font-display text-[10px] font-bold tracking-[0.3em] text-slate-400">
              <Trophy className="h-3.5 w-3.5 text-amber-300" /> HALL OF FAME
            </div>
            <HighScores entries={scores} max={6} />
          </div>
        </div>

        <div className="fade-up fade-up-d5 mt-6 text-center font-display text-[9px] tracking-[0.35em] text-slate-600">
          SURVIVE THE ESCALATION · LOCAL HIGH SCORES SAVED ON DEVICE
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAUSE
// ─────────────────────────────────────────────────────────────

interface PauseProps {
  wave: number;
  score: number;
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
}

export function PauseOverlay({ wave, score, muted, onResume, onRestart, onMenu, onToggleMute }: PauseProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05060f]/70 backdrop-blur-sm">
      <div className="glass fade-up w-72 rounded-2xl p-6 text-center sm:w-80">
        <div className="font-display text-3xl font-black tracking-[0.2em] text-white">PAUSED</div>
        <div className="mt-2 flex justify-center gap-4 font-display text-[11px] font-bold tracking-widest text-slate-400">
          <span>WAVE <span className="text-cyan-300">{wave}</span></span>
          <span>SCORE <span className="text-amber-300 tabular-nums">{score.toLocaleString()}</span></span>
        </div>
        <div className="mt-5 space-y-2">
          <button onClick={onResume} className="btn-neon flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm">
            <Play className="h-4 w-4 fill-current" /> RESUME <span className="keycap !border-black/30 !bg-black/20 !text-[#06121a]">P</span>
          </button>
          <button onClick={onRestart} className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm">
            <RotateCcw className="h-4 w-4" /> RESTART <span className="keycap">R</span>
          </button>
          <button onClick={onToggleMute} className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {muted ? "UNMUTE" : "MUTE"} <span className="keycap">M</span>
          </button>
          <button onClick={onMenu} className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm">
            <Home className="h-4 w-4" /> MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GAME OVER
// ─────────────────────────────────────────────────────────────

interface OverProps {
  finals: FinalStats;
  scores: ScoreEntry[];
  entryId: string | null;
  rank: number;
  onName: (name: string) => void;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOverOverlay({ finals, scores, entryId, rank, onName, onRestart, onMenu }: OverProps) {
  const [name, setName] = useState(getLastName());
  const isHigh = entryId !== null && rank >= 0;

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[#0b0209]/70 backdrop-blur-[3px]">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-4 py-8">
        <div className="fade-up font-display text-[10px] font-bold tracking-[0.5em] text-red-400/90">SIGNAL LOST</div>
        <h2 className="fade-up fade-up-d1 mt-2 bg-gradient-to-br from-red-400 via-rose-400 to-orange-300 bg-clip-text text-center font-display text-5xl font-black tracking-wider text-transparent drop-shadow-[0_0_30px_rgba(239,68,68,0.35)]">
          CORE BREACHED
        </h2>

        <div className="fade-up fade-up-d2 mt-5 text-center">
          <div className="font-display text-[10px] tracking-[0.4em] text-slate-500">FINAL SCORE</div>
          <div className="font-display text-6xl font-black tabular-nums text-white drop-shadow-[0_0_26px_rgba(34,211,238,0.3)]">
            {finals.score.toLocaleString()}
          </div>
        </div>

        <div className="fade-up fade-up-d3 mt-4 flex gap-2">
          <div className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5">
            <Skull className="h-3.5 w-3.5 text-rose-400" />
            <span className="font-display text-xs font-bold text-slate-200 tabular-nums">{finals.kills} KILLS</span>
          </div>
          <div className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5">
            <Crown className="h-3.5 w-3.5 text-cyan-300" />
            <span className="font-display text-xs font-bold text-slate-200 tabular-nums">WAVE {finals.wave}</span>
          </div>
          <div className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5">
            <Heart className="h-3.5 w-3.5 fill-red-400 text-red-400" />
            <span className="font-display text-xs font-bold text-slate-200">0</span>
          </div>
        </div>

        {isHigh && (
          <form
            className="fade-up fade-up-d4 mt-4 w-full max-w-xs"
            onSubmit={(e) => { e.preventDefault(); onRestart(); }}
          >
            <div className="mb-1.5 text-center font-display text-[10px] font-bold tracking-[0.3em] text-emerald-300">
              NEW HIGH SCORE — RANK #{rank + 1}
            </div>
            <input
              value={name}
              autoFocus
              maxLength={12}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, "");
                setName(v);
                setLastName(v);
                onName(v);
              }}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-center font-display text-lg font-bold tracking-[0.3em] text-emerald-200 outline-none placeholder:text-slate-600 focus:border-emerald-300 focus:shadow-[0_0_20px_rgba(52,211,153,0.3)]"
              placeholder="CALLSIGN"
            />
          </form>
        )}

        <div className="fade-up fade-up-d4 glass mt-5 w-full rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-1.5 font-display text-[10px] font-bold tracking-[0.3em] text-slate-400">
            <Trophy className="h-3.5 w-3.5 text-amber-300" /> HALL OF FAME
          </div>
          <HighScores entries={scores} highlightId={entryId} max={8} />
        </div>

        <div className="fade-up fade-up-d5 mt-5 flex w-full max-w-xs flex-col gap-2">
          <button onClick={onRestart} className="btn-neon flex items-center justify-center gap-2 rounded-xl py-3 text-sm">
            <RotateCcw className="h-4 w-4" /> REDEPLOY <span className="keycap !border-black/30 !bg-black/20 !text-[#06121a]">ENTER</span>
          </button>
          <button onClick={onMenu} className="btn-ghost flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm">
            <Home className="h-4 w-4" /> MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
