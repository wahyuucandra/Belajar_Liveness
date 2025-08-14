"use client";
import { readableAction } from "@/utils/helpers/challengeHelpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../atoms/Tooltip";
import { Info } from "lucide-react";

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
    <div className="mt-3 w-fit max-w-xl pointer-events-auto">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <div className="rounded-2xl bg-black/60 ring-1 ring-white/10 backdrop-blur">
            <TooltipTrigger asChild>
              <button
                type="button"
                className="w-full flex items-start gap-3 cursor-help select-none outline-none p-3 md:p-4"
                aria-label={`Instruksi untuk ${readableAction(type as any)}`}
              >
                <div className="shrink-0 mt-1 h-2.5 w-2.5 rounded-full bg-amber-300 animate-pulse" />
                <div className="text-white/90 flex-1 flex items-center justify-between">
                  <div className="text-sm md:text-base font-medium">
                    {readableAction(type as any)}
                  </div>
                  <span className="ml-2 inline-flex items-center gap-2 text-xs md:text-sm opacity-80">
                    <Info className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </button>
            </TooltipTrigger>

            <TooltipContent
              side="bottom"
              align="start"
              sideOffset={8}
              className="z-50 pointer-events-auto max-w-[min(90vw,38rem)] p-0 bg-zinc-900/95 text-white/90 border-white/10 shadow-xl"
            >
              <div
                id="instruction-body"
                className="p-3 md:p-4 text-white/90 max-h-[60vh] overflow-auto"
              >
                <ul className="space-y-1 text-xs md:text-sm list-disc ml-5 opacity-90">
                  {spesifik.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                  <li className="mt-1">Tips umum:</li>
                  {umum.map((s, i) => (
                    <li key={`u-${i}`} className="opacity-80">
                      {s}
                    </li>
                  ))}
                </ul>

                {hint && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs md:text-sm">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{hint}</span>
                  </div>
                )}
              </div>
            </TooltipContent>
          </div>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}