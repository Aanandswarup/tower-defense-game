import GameCanvas from "./components/GameCanvas";

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <GameCanvas />
      {/* atmosphere layers (pure CSS, zero GPU cost) */}
      <div className="vignette pointer-events-none fixed inset-0 z-40" />
      <div className="scanlines pointer-events-none fixed inset-0 z-40" />
    </div>
  );
}
