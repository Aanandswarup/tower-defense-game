import { Coins, Trash2, TrendingUp, X } from "lucide-react";
import type { InspectInfo } from "../game/engine";

interface Props {
  info: InspectInfo;
  cssX: number;
  cssY: number;
  below: boolean;
  gold: number;
  onUpgrade: () => void;
  onSell: () => void;
  onClose: () => void;
}

export default function TowerPanel({ info, cssX, cssY, below, gold, onUpgrade, onSell, onClose }: Props) {
  const canUpgrade = info.upgradeCost !== null && gold >= info.upgradeCost;
  return (
    <div
      className="pointer-events-auto absolute z-30 w-56 -translate-x-1/2"
      style={{ left: cssX, top: cssY, transform: `translate(-50%, ${below ? "0%" : "-100%"})` }}
    >
      <div
        className="glass fade-up rounded-xl p-3"
        style={{ boxShadow: `0 0 0 1px ${info.color}55, 0 8px 34px rgba(0,0,0,0.55), 0 0 26px ${info.color}22` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: info.color, boxShadow: `0 0 8px ${info.color}` }} />
            <span className="font-display text-sm font-bold tracking-wider text-white">{info.name.toUpperCase()}</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-widest text-cyan-200">
              LV {info.level}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div className="rounded-md bg-black/30 py-1">
            <div className="font-display text-[8px] tracking-[0.2em] text-slate-500">DMG</div>
            <div className="font-display text-xs font-bold text-white tabular-nums">
              {info.dmg}
              {info.nextDmg !== null && <span className="text-emerald-400"> →{info.nextDmg}</span>}
            </div>
          </div>
          <div className="rounded-md bg-black/30 py-1">
            <div className="font-display text-[8px] tracking-[0.2em] text-slate-500">SPD</div>
            <div className="font-display text-xs font-bold text-white tabular-nums">{info.rate}/s</div>
          </div>
          <div className="rounded-md bg-black/30 py-1">
            <div className="font-display text-[8px] tracking-[0.2em] text-slate-500">KILLS</div>
            <div className="font-display text-xs font-bold text-white tabular-nums">{info.kills}</div>
          </div>
        </div>

        <div className="mt-2 flex gap-1.5">
          {info.upgradeCost !== null ? (
            <button
              onClick={onUpgrade}
              disabled={!canUpgrade}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 font-display text-[10px] font-bold tracking-wider transition-all active:scale-95 ${
                canUpgrade
                  ? "bg-emerald-400/90 text-emerald-950 hover:bg-emerald-300 hover:shadow-[0_0_16px_rgba(52,211,153,0.5)]"
                  : "cursor-not-allowed bg-white/5 text-slate-500"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              UPGRADE
              <span className="flex items-center gap-0.5 tabular-nums"><Coins className="h-3 w-3" />{info.upgradeCost}</span>
            </button>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg bg-white/5 py-1.5 font-display text-[10px] font-bold tracking-wider text-amber-300">
              MAX LEVEL
            </div>
          )}
          <button
            onClick={onSell}
            className="flex items-center justify-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1.5 font-display text-[10px] font-bold tracking-wider text-rose-300 transition-all hover:bg-rose-500/30 active:scale-95"
          >
            <Trash2 className="h-3.5 w-3.5" />+{info.sellValue}
          </button>
        </div>
      </div>
    </div>
  );
}
