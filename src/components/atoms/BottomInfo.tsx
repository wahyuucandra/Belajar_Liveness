"use client";

export function BottomInfo({
  ready,
  error,
  showStats,
  bestScore,
  frames,
  matched,
  ear,
  baselineEar,
}: {
  ready: boolean;
  error?: string | null;
  showStats?: boolean;
  bestScore: number;
  frames: number;
  matched: number;
  ear?: number;
  baselineEar?: number;
}) {
  return (
    <div className="absolute left-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] md:bottom-15 text-white/90 text-sm md:text-base space-y-1">
      {!ready && <div className="rounded-lg bg-white/10 px-3 py-1">Memuat model…</div>}
      {error && <div className="rounded-lg bg-red-500/80 px-3 py-1">{error}</div>}
      <div className="rounded-lg bg-white/10 px-3 py-1">
        {typeof ear === "number" && typeof baselineEar === "number" && (
          <>
            EAR: {ear.toFixed(3)} • BL: {baselineEar.toFixed(3)} •
          </>
        )}
        &nbsp;Skor terbaik: {bestScore.toFixed(2)} • Frame: {frames} • Match: {matched}
      </div>
    </div>
  );
}