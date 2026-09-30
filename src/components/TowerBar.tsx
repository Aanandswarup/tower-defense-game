import { Bomb, Coins, Crosshair, Snowflake, Zap, type LucideIcon } from "lucide-react";
import { TOWERS, TOWER_ORDER, type TowerType } from "../game/config";

export const TOWER_ICONS: Record<TowerType, LucideIcon> = {
  pulse: Zap,
  rail: Crosshair,
  frost: Snowflake,
  mortar: Bomb,
};

interface Props {
  gold: number;
  buildType: TowerType | null;
  onSelect: (t: TowerType | null) => void;
}

export default function TowerBar({ gold, buildType, onSelect }: Props) {
  return (
    <div className="relative z-20 px-2 pb-2 pt-1 sm:px-4 sm:pb-3">
      <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1.5 sm:gap-2.5">
        {TOWER_ORDER.map((t, i) => {
          const def = TOWERS[t];
          const Icon = TOWER_ICONS[t];
          const selected = buildType === t;
          const affordable = gold >= def.cost;
          return (
            <button
              key={t}
              onClick={() => onSelect(selected ? null : t)}
              className={`card-shine group relative flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 transition-all duration-150 active:scale-95 sm:py-2 ${
                selected
                  ? "border-transparent bg-white/[0.08]"
                  : "glass hover:bg-white/[0.06]"
              } ${!affordable && !selected ? "opacity-45 saturate-50" : ""}`}
              style={
                selected
                  ? { boxShadow: `0 0 0 1.5px ${def.color}, 0 0 22px ${def.color}44, inset 0 0 18px ${def.color}18` }
                  : undefined
              }
            >
              <span
                className="keycap absolute left-1.5 top-1.5 hidden sm:inline-flex"
                style={selected ? { borderColor: `${def.color}88`, color: def.color } : undefined}
              >
                {i + 1}
              </span>
              <Icon
                className="h-5 w-5 transition-transform duration-150 group-hover:scale-110 sm:h-6 sm:w-6"
                style={{ color: def.color, filter: selected ? `drop-shadow(0 0 7px ${def.color})` : undefined }}
              />
              <span className="font-display text-[10px] font-bold tracking-wider text-slate-200 sm:text-[11px]">
                {def.name.toUpperCase()}
              </span>
              <span className="hidden text-[10px] font-semibold tracking-wide text-slate-500 lg:block">{def.tag}</span>
              <span className={`flex items-center gap-1 font-display text-[11px] font-bold tabular-nums sm:text-xs ${affordable ? "text-amber-300" : "text-slate-500"}`}>
                <Coins className="h-3 w-3" />
                {def.cost}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none mt-1 hidden text-center text-[11px] font-semibold tracking-wider text-slate-500 sm:block">
        {buildType ? (
          <span style={{ color: TOWERS[buildType].color }}>TAP THE GRID TO DEPLOY · RIGHT-CLICK / ESC TO CANCEL</span>
        ) : (
          <span>SELECT A TOWER · UPGRADE WITH <span className="keycap mx-0.5">U</span> · SELL WITH <span className="keycap mx-0.5">X</span></span>
        )}
      </div>
    </div>
  );
}
