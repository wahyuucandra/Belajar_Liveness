import { LogItem } from "@/interface/challenge";

export default function RealtimeLog({ logs, rightBadges }: { logs: LogItem[]; rightBadges?: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl bg-slate-800/70 backdrop-blur border border-slate-700 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Log Realtime</h3>
        <div className="text-xs text-slate-400 flex items-center gap-2">{rightBadges}</div>
      </div>
      <div className="max-h-44 md:max-h-60 overflow-auto divide-y divide-slate-700/60">
        {logs.length === 0 && <div className="text-sm text-slate-400 py-3">Belum ada log.</div>}
        {logs.map((l, idx) => (
          <div key={idx} className="py-2 flex items-start gap-3">
            <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded ${
              l.level === "success" ? "bg-emerald-500/20 text-emerald-300"
              : l.level === "warn" ? "bg-amber-500/20 text-amber-300"
              : l.level === "error" ? "bg-rose-500/20 text-rose-300"
              : "bg-slate-600/30 text-slate-300"}`}>
              {l.time}
            </span>
            <div className="text-sm text-slate-200">{l.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
