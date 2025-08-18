export default function StatsPill({ best, frame, match }:{ best:number; frame:number; match:number }) {
    return (
      <div className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-2xl bg-black/70 text-slate-100 text-sm border border-white/10 shadow">
        <span>Skor terbaik: {best.toFixed(2)}</span>
        <span className="mx-2">•</span>
        <span>Frame: {frame}</span>
        <span className="mx-2">•</span>
        <span>Match: {match}</span>
      </div>
    );
  }
  