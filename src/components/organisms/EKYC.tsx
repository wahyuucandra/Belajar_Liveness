"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFaceApi } from "@/hooks/useFaceApi";
import { LogItem, STEPS, StepId, ts } from "@/interface/challenge";
import { useCountdown } from "@/hooks/useCountdown";
import { useOverlayRenderer } from "@/hooks/useOverlayRenderer";
import VideosHUD from "@/components/molecules/VideosHUD";
import RealtimeLog from "@/components/molecules/RealtimeLog";
import StepList from "@/components/molecules/StepList";
import ProgressBar from "@/components/atoms/ProgressBar";
import StatusChip from "@/components/atoms/StatusChip";

export default function EKYC() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<StepId | null>(null);
  const [progress, setProgress] = useState<Record<StepId, number>>({
    "look-left": 0, blink: 0, "look-right": 0, smile: 0, "open-mouth": 0, nod: 0, tilt: 0, "move-closer": 0,
  });
  const [logs, setLogs] = useState<LogItem[]>([]);

  const { faceapi, ready: faReady, error: faError } = useFaceApi();
  const { facesCount, expression, stats } = useOverlayRenderer(faceapi as any, faReady, videoRef, overlayRef);

  const activeStep = useMemo(() => STEPS.find((s) => s.id === activeId) || null, [activeId]);
  const { left: countdown, start: startCountdown, clear: clearTimer } = useCountdown(10, () => {
    if (activeStep) pushLog("warn", `Waktu habis untuk langkah: ${activeStep.title}`);
  });

  const pushLog = (level: LogItem["level"], text: string) =>
    setLogs((prev) => [{ time: ts(), level, text }, ...prev].slice(0, 200));

  // select step
  const selectStep = (id: StepId) => {
    setActiveId(id);
    setProgress((p) => ({ ...p, [id]: 0 }));
    const s = STEPS.find((x) => x.id === id)!;
    pushLog("info", `Mulai langkah: ${s.title} (batas 10 dtk)`);
    startCountdown();
  };

  // simulate detection hit
  const markDetected = () => {
    if (!activeStep) return;
    setProgress((p) => {
      const curr = p[activeStep.id];
      const next = Math.min(activeStep.requiredCount, curr + 1);
      const updated = { ...p, [activeStep.id]: next } as Record<StepId, number>;
      if (next >= activeStep.requiredCount) {
        clearTimer();
        pushLog("success", `Selesai: ${activeStep.title}`);
      } else {
        pushLog("info", `Terbaca ${next}/${activeStep.requiredCount} untuk ${activeStep.title}`);
      }
      return updated;
    });
  };

  const resetAll = () => {
    clearTimer();
    setActiveId(null);
    setProgress({ "look-left": 0, blink: 0, "look-right": 0, smile: 0, "open-mouth": 0, nod: 0, tilt: 0, "move-closer": 0 });
    setLogs([]);
    pushLog("info", "Reset semua status");
  };

  // init camera
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!mounted) return;
        if (videoRef.current) {
          (videoRef.current as HTMLVideoElement).srcObject = stream as any;
          await (videoRef.current as HTMLVideoElement).play();
          setCameraReady(true);
          pushLog("info", "Kamera aktif");
        }
      } catch (err: any) {
        setCameraError(err?.message || "Tidak bisa mengakses kamera");
        pushLog("error", `Kamera gagal: ${err?.message || "unknown"}`);
      }
    })();
    return () => {
      mounted = false;
      clearTimer();
      const tracks = (videoRef.current?.srcObject as MediaStream | null)?.getTracks?.() || [];
      tracks.forEach((t) => t.stop());
    };
  }, []);

  const activePct = activeStep ? Math.round((progress[activeStep.id] / activeStep.requiredCount) * 100) : 0;
  const faceDetected = facesCount > 0;

  return (
    <div className="relative min-h-screen text-slate-100 p-4 sm:p-6 overflow-hidden">
      {/* background & header sama persis */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage:"radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 40%, white 1.5px, transparent 1.5px), radial-gradient(circle at 60% 80%, white 1px, transparent 1px)", backgroundSize:"40px 40px, 60px 60px, 50px 50px" }} />
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full blur-3xl opacity-30"
        style={{ background:"conic-gradient(from 180deg at 50% 50%, rgba(56,189,248,0.6), rgba(99,102,241,0.5), rgba(16,185,129,0.5), rgba(56,189,248,0.6))" }} />

      <div className="relative mx-auto max-w-6xl">
        <h1 className="text-2xl sm:text-3xl font-semibold">Verifikasi Wajah (eKYC)</h1>
        {faError && <div className="mt-2 text-sm text-amber-300">Gagal memuat model face-api: {faError}</div>}
        {!faError && !faReady && <div className="mt-2 text-sm text-slate-300">Memuat model face-api…</div>}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left */}
          <div className="lg:col-span-2">
            <VideosHUD
              videoRef={videoRef} overlayRef={overlayRef}
              cameraReady={cameraReady} faceDetected={faceDetected}
              tooDark={false}
              stats={stats} activeStep={activeStep} progress={progress}
              countdown={countdown} faReady={faReady} facesCount={facesCount} faError={faError}
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={markDetected} disabled={!activeStep}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-400 hover:bg-emerald-500 transition">
                Tandai Terdeteksi
              </button>
              <button onClick={startCountdown} disabled={!activeStep}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sky-600 disabled:bg-slate-700 disabled:text-slate-400 hover:bg-sky-500 transition">
                Mulai Ulang Timer 10s
              </button>
              <button onClick={resetAll} className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 transition">
                Reset
              </button>
              {activeStep && (
                <div className="order-3 sm:order-none w-full sm:w-auto sm:ml-auto flex items-center gap-2 mt-3 sm:mt-0">
                  <span className="text-sm text-slate-300">Progress</span>
                  <div className="w-full sm:w-44"><ProgressBar value={activePct} /></div>
                </div>
              )}
            </div>

            <RealtimeLog
              logs={logs}
              rightBadges={
                <>
                  <span className="px-2 py-0.5 rounded bg-slate-900/70 border border-slate-700">{/* brightness optional */}</span>
                  <span className={`px-2 py-0.5 rounded border ${faceDetected ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-slate-900/70 text-slate-300 border-slate-700"}`}>
                    face: {String(faceDetected)}
                  </span>
                </>
              }
            />
          </div>

          {/* Right */}
          <div className="lg:col-span-1 lg:sticky lg:top-4">
            <div className="rounded-2xl bg-slate-800/70 backdrop-blur p-4 border border-slate-700 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Langkah eKYC</h2>
                <StatusChip on={cameraReady} label="Kamera" />
              </div>

              <StepList activeId={activeId} progress={progress} onSelect={selectStep} />

              <div className="mt-4">
                <div className="text-sm mb-1 text-slate-300">Ekspresi Terdeteksi</div>
                <input readOnly className="w-full rounded-xl bg-slate-900/50 border border-slate-700 px-3 py-2 text-slate-200" value={expression} />
              </div>
            </div>
          </div>
        </div>

        {/* overlay canvas ditempatkan di VideoHUD */}
      </div>
    </div>
  );
}
