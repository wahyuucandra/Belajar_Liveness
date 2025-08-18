import { STEPS, StepId } from "@/interface/challenge";

export default function StepList({
  activeId, progress, onSelect,
}: {
  activeId: StepId | null;
  progress: Record<StepId, number>;
  onSelect: (id: StepId) => void;
}) {
  return (
    <div className="space-y-3 max-h-[40vh] md:max-h-[60vh] overflow-auto">
      {STEPS.map((s) => {
        const isActive = activeId === s.id;
        const done = progress[s.id] >= s.requiredCount;
        return (
          <button key={s.id} onClick={() => onSelect(s.id)}
            className={`w-full text-left rounded-xl border p-3 transition relative ${
              isActive ? "border-sky-400 bg-sky-400/10"
              : done ? "border-emerald-500/50 bg-emerald-500/10"
              : "border-slate-700 hover:border-slate-600 bg-slate-900/40"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-xs ${
                done ? "bg-emerald-500" : isActive ? "bg-sky-500" : "bg-slate-600"}`}>
                {done ? "✓" : isActive ? "•" : ""}
              </div>
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  {s.title}
                  {s.requiredCount > 1 && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-700">Repeat</span>}
                </div>
                <div className="text-slate-300 text-sm">{s.detail}</div>
                <div className="mt-1 text-xs text-slate-400">Progress: {progress[s.id]} / {s.requiredCount}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
