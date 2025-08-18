import React from "react";
export default function StatusChip({ on = false, label }: { on?: boolean; label: string }) {
  return (
    <span className={`text-xs px-2 py-1 rounded ${on ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-700 text-slate-300"}`}>
      {label} {on ? "aktif" : "off"}
    </span>
  );
}
