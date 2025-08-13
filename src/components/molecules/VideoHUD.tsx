"use client";
import React from "react";

export function VideoHUD({ countdown, bestScore }: { countdown: number; bestScore: number }) {
  return (
    <>
      <div className="absolute top-2 right-2 bg-white/80 text-xs px-2 py-1 rounded">Sisa: {Math.ceil(countdown)} dtk</div>
      <div className="absolute bottom-2 left-2 bg-white/80 text-xs px-2 py-1 rounded">Skor terbaik: {bestScore.toFixed(2)}</div>
    </>
  );
}