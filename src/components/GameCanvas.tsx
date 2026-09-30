import { useCallback, useEffect, useRef, useState } from "react";
import {
  Engine, type FinalStats, type GamePhase, type HudState, type InspectInfo, type ViewState,
} from "../game/engine";
import type { TowerType } from "../game/config";
import { clamp } from "../game/util";
import {
  addScore, getLastName, loadScores, qualifies, updateScoreName, type ScoreEntry,
} from "../game/storage";
import Hud from "./Hud";
import TowerBar from "./TowerBar";
import TowerPanel from "./TowerPanel";
import { GameOverOverlay, PauseOverlay, StartScreen } from "./Overlays";

export default function GameCanvas() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const [hud, setHud] = useState<HudState | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [buildType, setBuildType] = useState<TowerType | null>(null);
  const [inspect, setInspect] = useState<InspectInfo | null>(null);
  const [view, setView] = useState<ViewState>({ scale: 1, ox: 0, oy: 0, cssW: 1, cssH: 1 });
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [finals, setFinals] = useState<FinalStats | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [rank, setRank] = useState(-1);

  // refs for the global key handler
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const buildRef = useRef(buildType);
  buildRef.current = buildType;

  const startRun = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    setFinals(null);
    setEntryId(null);
    setRank(-1);
    eng.startGame();
    eng.setBuildType("pulse"); // preselect so the very first tap deploys
  }, []);

  const startRef = useRef(startRun);
  startRef.current = startRun;

  const goMenu = useCallback(() => {
    engineRef.current?.toMenu();
    setFinals(null);
  }, []);

  // ── engine lifecycle ──────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;

    const eng = new Engine(canvas, {
      onHud: (h) => setHud({ ...h }),
      onPhase: (p) => {
        setPhase(p);
        if (p === "menu") setScores(loadScores());
      },
      onInspect: (info) => setInspect(info),
      onBuild: (t) => setBuildType(t),
      onView: (v) => setView(v),
      onGameOver: (f) => {
        setFinals(f);
        if (qualifies(f.score)) {
          const res = addScore(getLastName(), f.score, f.wave, f.kills);
          setScores(res.list);
          setEntryId(res.id);
          setRank(res.rank);
        } else {
          setScores(loadScores());
          setEntryId(null);
          setRank(-1);
        }
      },
    });
    engineRef.current = eng;

    const doResize = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) eng.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);
    doResize();

    const onVis = () => { if (document.hidden) eng.pause(); };
    document.addEventListener("visibilitychange", onVis);
    const onAnyPointer = () => eng.audio.unlock();
    window.addEventListener("pointerdown", onAnyPointer);

    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onAnyPointer);
      eng.destroy();
      engineRef.current = null;
    };
  }, []);

  // ── keyboard ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const k = e.key === " " ? "space" : e.key.toLowerCase();
      const p = phaseRef.current;

      if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();

      if (p === "menu") {
        if (k === "enter" || k === "space") startRef.current();
        return;
      }
      if (p === "over") {
        if (k === "enter" || k === "r") startRef.current();
        return;
      }

      const select = (t: TowerType) => {
        if (p !== "playing") return;
        eng.setBuildType(buildRef.current === t ? null : t);
      };

      switch (k) {
        case "1": select("pulse"); break;
        case "2": select("rail"); break;
        case "3": select("frost"); break;
        case "4": select("mortar"); break;
        case "escape": eng.escape(); break;
        case "p": eng.togglePause(); break;
        case "m": eng.toggleMute(); break;
        case "f": eng.toggleSpeed(); break;
        case "r": startRef.current(); break;
        case "space": eng.callWaveEarly(); break;
        case "enter": eng.confirmCursor(); break;
        case "u": eng.upgradeInspected(); break;
        case "x": eng.sellInspected(); break;
        case "arrowleft": case "a": eng.moveCursor(-1, 0); break;
        case "arrowright": case "d": eng.moveCursor(1, 0); break;
        case "arrowup": case "w": eng.moveCursor(0, -1); break;
        case "arrowdown": case "s": eng.moveCursor(0, 1); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── pointer ──────────────────────────────────────────────
  const localPos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // panel anchoring
  const panel = inspect && phase === "playing"
    ? {
        x: clamp(view.ox + inspect.x * view.scale, 116, Math.max(117, view.cssW - 116)),
        y: view.oy + inspect.y * view.scale,
        below: view.oy + inspect.y * view.scale < 190,
      }
    : null;

  const inRun = phase === "playing" || phase === "paused";

  return (
    <div className="relative flex h-full w-full flex-col select-none">
      {inRun && hud && (
        <Hud
          hud={hud}
          onSendWave={() => engineRef.current?.callWaveEarly()}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onToggleSpeed={() => engineRef.current?.toggleSpeed()}
          onPause={() => engineRef.current?.togglePause()}
        />
      )}

      <div ref={wrapRef} className="relative min-h-0 w-full flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          onPointerDown={(e) => {
            const { x, y } = localPos(e);
            engineRef.current?.pointerDown(x, y, e.button);
          }}
          onPointerMove={(e) => {
            const { x, y } = localPos(e);
            engineRef.current?.pointerMove(x, y);
          }}
          onPointerLeave={() => engineRef.current?.pointerLeave()}
          onContextMenu={(e) => e.preventDefault()}
        />
        {panel && inspect && (
          <div className="pointer-events-none absolute inset-0">
            <TowerPanel
              info={inspect}
              cssX={panel.x}
              cssY={panel.y + (panel.below ? 42 : -36)}
              below={panel.below}
              gold={hud?.gold ?? 0}
              onUpgrade={() => engineRef.current?.upgradeInspected()}
              onSell={() => engineRef.current?.sellInspected()}
              onClose={() => engineRef.current?.setInspect(null)}
            />
          </div>
        )}
      </div>

      {inRun && hud && (
        <TowerBar gold={hud.gold} buildType={buildType} onSelect={(t) => engineRef.current?.setBuildType(t)} />
      )}

      {phase === "menu" && <StartScreen scores={scores} onStart={startRun} />}
      {phase === "paused" && hud && (
        <PauseOverlay
          wave={hud.wave}
          score={hud.score}
          muted={hud.muted}
          onResume={() => engineRef.current?.resume()}
          onRestart={startRun}
          onMenu={goMenu}
          onToggleMute={() => engineRef.current?.toggleMute()}
        />
      )}
      {phase === "over" && finals && (
        <GameOverOverlay
          finals={finals}
          scores={scores}
          entryId={entryId}
          rank={rank}
          onName={(n) => { if (entryId) setScores(updateScoreName(entryId, n)); }}
          onRestart={startRun}
          onMenu={goMenu}
        />
      )}
    </div>
  );
}
