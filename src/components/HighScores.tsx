import { Crown } from "lucide-react";
import type { ScoreEntry } from "../game/storage";

interface Props {
  entries: ScoreEntry[];
  highlightId?: string | null;
  max?: number;
}

const RANK_COLORS = ["text-amber-300", "text-slate-300", "text-orange-400"];

export default function HighScores({ entries, highlightId = null, max = 10 }: Props) {
  const rows = entries.slice(0, max);
  return (
    <div className="w-full">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700/70 px-4 py-5 text-center text-sm text-slate-500">
          No runs logged yet.
          <br />
          <span className="text-cyan-400/80">Be the first commander on the board.</span>
        </div>
      ) : (
        <div className="scroll-slim max-h-56 space-y-1 overflow-y-auto pr-1">
          {rows.map((e, i) => {
            const hot = e.id === highlightId;
            return (
              <div
                key={e.id}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-semibold tabular-nums transition-colors ${
                  hot ? "bg-cyan-400/15 ring-1 ring-cyan-400/60" : i % 2 === 0 ? "bg-white/[0.04]" : "bg-white/[0.015]"
                }`}
              >
                <span className={`flex w-6 items-center justify-center font-display text-xs font-bold ${RANK_COLORS[i] ?? "text-slate-500"}`}>
                  {i === 0 ? <Crown className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`flex-1 truncate font-display text-xs tracking-wider ${hot ? "text-cyan-100" : "text-slate-200"}`}>
                  {e.name}
                </span>
                <span className="font-display text-[10px] text-slate-500">W{e.wave}</span>
                <span className={`font-display text-sm font-bold ${hot ? "text-cyan-200" : "text-amber-200"}`}>
                  {e.score.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
