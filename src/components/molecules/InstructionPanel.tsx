"use client";
import { readableAction } from "@/utils/helpers/challengeHelpers";

export function InstructionPanel({
  type,
  umum,
  spesifik,
  hint,
}: {
  type: string;
  umum: string[];
  spesifik: string[];
  hint?: string;
}) {
  return (
    <div className="mt-3 w-full max-w-xl pointer-events-auto">
      <div className="rounded-2xl bg-black/60 ring-1 ring-white/10 p-3 md:p-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-1 h-2.5 w-2.5 rounded-full bg-amber-300 animate-pulse" />
          <div className="text-white/90">
            <div className="text-sm md:text-base font-medium">{readableAction(type as any)}</div>
            <ul className="mt-1.5 space-y-1 text-xs md:text-sm list-disc ml-5 opacity-90">
              {spesifik.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
              <li className="mt-1">Tips umum:</li>
              {umum.map((s, i) => (
                <li key={`u-${i}`} className="opacity-80">{s}</li>
              ))}
            </ul>
            {hint && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs md:text-sm">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{hint}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}