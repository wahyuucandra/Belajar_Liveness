import React from "react";
import StatsPill from "@/components/atoms/StatsPill";

export default function VideoHUD({
  videoRef, overlayRef, cameraReady, faceDetected, tooDark, stats,
  activeStep, progress, countdown, faReady, facesCount, faError,
}: any) {
  const DURATION = 10;
  return (
    <div
      className="relative rounded-2xl overflow-hidden aspect-video shadow-2xl transition-all duration-300"
      style={{
        boxShadow: faceDetected
          ? "0 0 0 2px rgba(16,185,129,0.75), 0 0 35px 8px rgba(16,185,129,0.35)"
          : tooDark
          ? "0 0 0 2px rgba(251,191,36,0.7), 0 0 35px 8px rgba(251,191,36,0.3)"
          : "0 0 0 2px rgba(100,116,139,0.6)",
      }}
    >
      <div className={`absolute inset-0 ${faceDetected ? "animate-pulse" : ""}`} style={{ opacity: faceDetected ? 0.1 : 0 }} />
      <video ref={videoRef} className="w-full h-full object-cover bg-black" playsInline muted />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <StatsPill best={stats.best} frame={stats.frame} match={stats.match} />

      {!cameraReady && (
        <div className="absolute inset-0 grid place-items-center text-slate-300 bg-slate-900/60 backdrop-blur">
          <div className="text-center">
            <div className="animate-pulse text-sm">Mengaktifkan kamera…</div>
          </div>
        </div>
      )}

      {activeStep && (
        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur rounded-xl px-4 py-3 text-sm">
          <div className="font-medium">
            {activeStep.title} ( {progress[activeStep.id]} / {activeStep.requiredCount} )
          </div>
          <div className="text-slate-300">{activeStep.detail}</div>
        </div>
      )}

      {activeStep && (
        <div className="absolute top-4 right-4 bg-black/70 rounded-full w-12 h-12 sm:w-14 sm:h-14 grid place-items-center text-lg sm:text-xl font-semibold">
          {String(countdown || DURATION)}
        </div>
      )}

      {cameraReady && (
        <div className="absolute top-4 left-4 space-y-1">
          {!faceDetected && !tooDark && (
            <div className="px-3 py-1.5 text-xs rounded-lg bg-slate-900/70 border border-slate-600 text-slate-200">
              Wajah belum terdeteksi
            </div>
          )}
          {tooDark && (
            <div className="px-3 py-1.5 text-xs rounded-lg bg-amber-900/60 border border-amber-500 text-amber-200">
              Terlalu gelap — tambahkan cahaya
            </div>
          )}
          <div className="px-2 py-0.5 text-[11px] rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200">
            face-api: {faError ? `error` : faReady ? `aktif • ${facesCount} wajah` : "memuat…"}
          </div>
        </div>
      )}
    </div>
  );
}
