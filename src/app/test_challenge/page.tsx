"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Face Challenge (Popup only) — @vladmandic/face-api
 * Mobile-friendly: HTTPS check, getUserMedia polyfill, StrictMode-safe.
 */

export default function Page() {
  const [selected, setSelected] = useState<ChallengeType>("senyum");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<null | ChallengeResult>(null);
  const [log, setLog] = useState<string[]>([]);

  const start = () => {
    setLog([]);
    setResult(null);
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold">Face Challenge (Popup)</h1>
        <p className="text-sm text-gray-600">Pilih challenge, lalu mulai. Kamera aktif hanya saat popup terbuka.</p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">Pilih challenge:</label>
          <select
            className="px-3 py-2 rounded-xl bg-white shadow border text-sm"
            value={selected}
            onChange={(e) => {
              const val = e.target.value as ChallengeType;
              setSelected(val);
              setLog([]);
              setResult(null);
            }}
          >
            <option value="senyum">Senyum</option>
            <option value="lihat_kanan">Lihat Kanan</option>
            <option value="lihat_kiri">Lihat Kiri</option>
            <option value="lihat_atas">Lihat Atas</option>
            <option value="lihat_bawah">Lihat Bawah</option>
            <option value="buka_mulut">Buka Mulut</option>
          </select>
          <button className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={start}>
            Mulai Challenge
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="hidden md:block" />
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold text-lg">Log</h3>
            <ul className="text-sm text-gray-700 space-y-1 max-h-[60vh] overflow-auto mt-2">
              {log.map((l, i) => (
                <li key={i} className="whitespace-pre-wrap">{l}</li>
              ))}
            </ul>
            {result && (
              <div className={`mt-4 text-sm px-3 py-2 rounded-xl inline-block ${result.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                Hasil {readableType(result.type)} → {result.success ? "Lolos" : "Gagal"} — score {result.score.toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <ExpressionChallengeModal
          key={selected}
          type={selected}
          durationSec={4}
          threshold={0.8}
          thresholdDeg={18}
          thresholdMouth={0.3}
          onClose={() => setOpen(false)}
          onResult={(r) => {
            setResult(r);
            setLog((L) => [
              `Selesai: ${readableType(r.type)} — ${r.success ? "LOLOS" : "GAGAL"} | bestScore=${r.score.toFixed(2)} | frames=${r.frames} | matched=${r.matchedFrames}`,
              ...L,
            ]);
          }}
          onLog={(line) => setLog((L) => [line, ...L])}
        />
      )}
    </div>
  );
}

// ------------------ Face-API Loader ------------------
function useFaceApi() {
  const faceapiRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const faceapi = await import("@vladmandic/face-api");
        faceapiRef.current = faceapi;
        const url = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceExpressionNet.loadFromUri(url),
        ]);
        if (mounted) setReady(true);
      } catch (e: any) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load models");
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { faceapi: faceapiRef.current, ready, error } as const;
}

// ------------------ Types & Helpers ------------------
export type ChallengeType =
  | "senyum"
  | "lihat_kanan"
  | "lihat_kiri"
  | "lihat_atas"
  | "lihat_bawah"
  | "buka_mulut";

export type ChallengeResult = { type: ChallengeType; success: boolean; score: number; frames: number; matchedFrames: number };

function readableType(t: ChallengeType) {
  if (t === "senyum") return "Senyum";
  if (t === "lihat_kanan") return "Lihat Kanan";
  if (t === "lihat_kiri") return "Lihat Kiri";
  if (t === "lihat_atas") return "Lihat Atas";
  if (t === "lihat_bawah") return "Lihat Bawah";
  if (t === "buka_mulut") return "Buka Mulut";
  return t;
}

interface Point { x: number; y: number }
function estimateHeadPoseFrom68(pts: Point[]) {
  if (!pts || pts.length < 68) return { roll: 0, pitch: 0, yaw: 0 };
  const L = pts[36];
  const R = pts[45];
  const N = pts[30];
  const LM = pts[48];
  const RM = pts[54];
  const dxEye = R.x - L.x;
  const dyEye = R.y - L.y;
  const roll = (Math.atan2(dyEye, dxEye) * 180) / Math.PI;
  const eyeMid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const mouthMid = { x: (LM.x + RM.x) / 2, y: (LM.y + RM.y) / 2 };
  const faceH = Math.hypot(mouthMid.x - eyeMid.x, mouthMid.y - eyeMid.y) || 1;
  const eyeW = Math.hypot(dxEye, dyEye) || 1;
  const yaw = ((N.x - eyeMid.x) / eyeW) * 60; // ±60°
  const norm = (N.y - eyeMid.y) / faceH;
  const pitch = (norm - 0.5) * 90 * -1; // atas negatif
  return { roll, pitch, yaw };
}

// -------------- Media helpers (mobile-friendly) --------------
async function getCameraStream(preferFront = true): Promise<MediaStream> {
  const errHttps = !window.isSecureContext ? new Error("Akses kamera butuh HTTPS. Gunakan https:// atau localhost.") : null;
  const nav: any = navigator as any;
  const gum = nav.mediaDevices?.getUserMedia?.bind(nav.mediaDevices);

  const constraints1 = { video: { facingMode: preferFront ? "user" : "environment" }, audio: false } as MediaStreamConstraints;
  const constraints2 = { video: true, audio: false } as MediaStreamConstraints; // fallback tanpa facingMode

  try {
    if (!gum) throw errHttps || new Error("Browser tidak mendukung navigator.mediaDevices.getUserMedia.");
    try { return await gum(constraints1); } catch { return await gum(constraints2); }
  } catch (e1) {
    const legacy = nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.msGetUserMedia;
    if (!legacy) throw e1;
    return await new Promise((res, rej) => legacy.call(nav, constraints2, res, (e: any) => rej(e1 || e)));
  }
}

// ------------------ POPUP CHALLENGE ------------------
function ExpressionChallengeModal({
  type,
  open = true,
  durationSec = 4,
  threshold = 0.8,
  thresholdDeg = 18,
  thresholdMouth = 0.3,
  onClose,
  onResult,
  onLog,
}: {
  type: ChallengeType;
  open?: boolean;
  durationSec?: number;
  threshold?: number; // ekspresi (senyum)
  thresholdDeg?: number; // pose (derajat)
  thresholdMouth?: number; // buka mulut (rasio)
  onClose: () => void;
  onResult: (r: ChallengeResult) => void;
  onLog?: (line: string) => void;
}) {
  const { faceapi, ready, error } = useFaceApi();
  const options = useMemo(() => {
    if (!faceapi) return null;
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.6 });
  }, [faceapi]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedMeta = useRef(false);

  // refs agar akurat di rAF
  const framesRef = useRef(0);
  const matchedRef = useRef(0);
  const bestScoreRef = useRef(0);

  const [frames, setFrames] = useState(0);
  const [matched, setMatched] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [countdown, setCountdown] = useState(durationSec);

  const lastLog = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;

    let raf = 0;
    let stream: MediaStream | null = null;
    let startAt = 0;

    const start = async () => {
      try {
        const v = videoRef.current!;
        v.setAttribute("playsinline", "true");
        v.muted = true;
        v.autoplay = true;

        stream = await getCameraStream(true);
        loadedMeta.current = false;
        v.onloadedmetadata = async () => {
          loadedMeta.current = true;
          try { await v.play(); } catch {}
        };
        v.srcObject = stream;

        framesRef.current = 0; matchedRef.current = 0; bestScoreRef.current = 0;
        setFrames(0); setMatched(0); setBestScore(0); setCountdown(durationSec);
        startAt = performance.now();
        onLog?.(`Mulai challenge: ${readableType(type)} (${durationSec}s)`);

        const tick = async () => {
          if (!videoRef.current || !faceapi || !options || !loadedMeta.current) { raf = requestAnimationFrame(tick); return; }
          try {
            const det = await faceapi
              .detectAllFaces(videoRef.current, options)
              .withFaceLandmarks()
              .withFaceExpressions();
            const main = det?.[0];
            if (main) {
              const pts = main.landmarks.positions.map((p: any) => ({ x: p.x, y: p.y })) as Point[];
              const pose = estimateHeadPoseFrom68(pts);
              const exprEntries = Object.entries(main.expressions) as [string, number][];
              const happy = (exprEntries.find(([k]) => k === "happy")?.[1] ?? 0) as number;

              // buka mulut ratio
              const topInner = pts[62];
              const bottomInner = pts[66];
              const leftM = pts[48];
              const rightM = pts[54];
              const mouthOpen = Math.hypot(topInner.x - bottomInner.x, topInner.y - bottomInner.y) / (Math.hypot(rightM.x - leftM.x, rightM.y - leftM.y) || 1);

              let score = 0; let passFrame = false;
              if (type === "senyum") { score = happy; passFrame = score >= threshold; }
              else if (type === "lihat_kanan") { const deg = -pose.yaw; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg; }
              else if (type === "lihat_kiri") { const deg = pose.yaw; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg; }
              else if (type === "lihat_atas") { const deg = -pose.pitch; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg; }
              else if (type === "lihat_bawah") { const deg = pose.pitch; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg; }
              else if (type === "buka_mulut") { score = Math.max(0, Math.min(1, mouthOpen / thresholdMouth)); passFrame = mouthOpen >= thresholdMouth; }

              framesRef.current += 1; setFrames(framesRef.current);
              if (passFrame) { matchedRef.current += 1; setMatched(matchedRef.current); }
              if (score > bestScoreRef.current) { bestScoreRef.current = score; setBestScore(score); }

              const now = performance.now();
              if (now - lastLog.current > 500) {
                let info = "";
                if (type === "senyum") info = `happy=${happy.toFixed(2)}`;
                else if (type.startsWith("lihat")) info = `yaw=${pose.yaw.toFixed(1)}° pitch=${pose.pitch.toFixed(1)}°`;
                else if (type === "buka_mulut") info = `mouthOpen=${mouthOpen.toFixed(2)}`;
                onLog?.(`Frame#${framesRef.current} ${info} | score=${score.toFixed(2)} ${passFrame ? "✓" : ""}`);
                lastLog.current = now;
              }
            } else {
              const now = performance.now();
              if (now - lastLog.current > 1000) {
                onLog?.("Tidak ada wajah terdeteksi — silakan pindah ke tempat yang lebih terang.");
                lastLog.current = now;
              }
            }
          } catch (e) {
            // swallow per-frame errors
          }

          const elapsed = (performance.now() - startAt) / 1000;
          const left = Math.max(0, durationSec - elapsed);
          setCountdown(left);
          if (left > 0) raf = requestAnimationFrame(tick);
          else {
            const ratio = matchedRef.current / Math.max(1, framesRef.current);
            const success = ratio >= 0.5; // konsisten untuk semua challenge; sesuaikan bila perlu
            onResult({ type, success, score: bestScoreRef.current, frames: framesRef.current, matchedFrames: matchedRef.current });
            stop();
          }
        };
        raf = requestAnimationFrame(tick);
      } catch (e: any) {
        console.error(e);
        onLog?.((e?.message || "Gagal mengakses kamera") + (window.isSecureContext ? "" : " — pastikan menggunakan HTTPS."));
      }
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      const v = videoRef.current;
      if (v) {
        try { v.pause(); } catch {}
        v.srcObject = null;
      }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      started.current = false;
    };

    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, durationSec, threshold, thresholdDeg, thresholdMouth, ready, options]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Verifikasi: {readableType(type)}</h2>
            <p className="text-xs text-gray-500">
              {type === "senyum" && "Tersenyumlah lebar hingga gigi terlihat."}
              {type === "lihat_kanan" && "Arahkan wajah ke kanan (dari sudut pandang Anda)."}
              {type === "lihat_kiri" && "Arahkan wajah ke kiri."}
              {type === "lihat_atas" && "Arahkan wajah ke atas."}
              {type === "lihat_bawah" && "Arahkan wajah ke bawah."}
              {type === "buka_mulut" && "Buka mulut selebar mungkin."}
            </p>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" muted playsInline autoPlay />
              <div className="absolute top-2 right-2 bg-white/80 text-xs px-2 py-1 rounded">Sisa: {Math.ceil(countdown)} dtk</div>
              <div className="absolute bottom-2 left-2 bg-white/80 text-xs px-2 py-1 rounded">Skor terbaik: {bestScore.toFixed(2)}</div>
            </div>

            {!ready && <div className="text-sm text-gray-600">Memuat model…</div>}
            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-3 py-2 rounded-xl bg-gray-100">Batal</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
