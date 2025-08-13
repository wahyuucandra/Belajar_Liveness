"use client";
import { useFaceApi } from "@/hooks/useFaceApi";
import { ChallengeResult, ChallengeType, Point } from "@/interface/challenge";
import { readableType } from "@/utils/helpers/challengeHelpers";
import { eyeAspectRatio, LEFT_EYE, RIGHT_EYE } from "@/utils/helpers/landmarks";
import { estimateHeadPoseFrom68 } from "@/utils/helpers/pose";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { VideoHUD } from "../molecules/VideoHUD";
import { useCamera } from "@/providers/CameraProvider";

export function ExpressionChallengeModal({
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
  threshold?: number;
  thresholdDeg?: number;
  thresholdMouth?: number;
  onClose: (reason: "auto" | "cancel") => void;
  onResult: (r: ChallengeResult) => void;
  onLog?: (line: string) => void;
}) {
  const { faceapi, ready, error } = useFaceApi();
  const options = useMemo(() => {
    if (!faceapi) return null;
    return new (faceapi as any).TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 });
  }, [faceapi]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedMeta = useRef(false);

  const framesRef = useRef(0);
  const matchedRef = useRef(0);
  const bestScoreRef = useRef(0);

  const blinkState = useRef({ closed: false });
  const blinkClosedFrames = useRef(0);
  const earRef = useRef(0);
  const baselineEarRef = useRef(0);
  const haveBaselineRef = useRef(false);

  const yawHistory = useRef<number[]>([]);

  const [frames, setFrames] = useState(0);
  const [matched, setMatched] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [countdown, setCountdown] = useState(durationSec);

  const lastLog = useRef(0);
  const started = useRef(false);
  const finishedRef = useRef(false);

  const { ensureStream } = useCamera();

  useEffect(() => {
    if (!open || started.current || !ready || !faceapi || !options) return;
    started.current = true;
    finishedRef.current = false;

    onLog?.(`Mulai challenge: ${readableType(type)} (${durationSec}s)`);

    let raf = 0; let stream: MediaStream | null = null; let startAt = 0;

    const start = async () => {
      const v = videoRef.current!;
      v.setAttribute("playsinline", "true");
      v.muted = true; v.autoplay = true;
      stream = await ensureStream(true);
      loadedMeta.current = false;
      v.onloadedmetadata = async () => { loadedMeta.current = true; try { await v.play(); } catch {} };
      (v as any).srcObject = stream as any;

      framesRef.current = matchedRef.current = bestScoreRef.current = 0;
      yawHistory.current = [];
      blinkState.current = { closed: false };
      blinkClosedFrames.current = 0; earRef.current = 0;
      baselineEarRef.current = 0; haveBaselineRef.current = false;
      setFrames(0); setMatched(0); setBestScore(0); setCountdown(durationSec);
      startAt = performance.now();

      const tick = async () => {
        if (!videoRef.current || !loadedMeta.current) {
          raf = requestAnimationFrame(tick); return;
        }
        try {
          let main: any = null;
          if (type === "kedip") {
            const det = await (faceapi as any).detectSingleFace(videoRef.current, options).withFaceLandmarks();
            if (det) main = det;
          } else {
            const det = await (faceapi as any).detectAllFaces(videoRef.current, options).withFaceLandmarks().withFaceExpressions();
            main = det?.[0] || null;
          }

          if (main) {
            const pts = main.landmarks.positions.map((p: any) => ({ x: p.x, y: p.y })) as Point[];
            const pose = estimateHeadPoseFrom68(pts);
            const happy = (main.expressions?.happy ?? 0) as number;

            const topInner = pts[62], bottomInner = pts[66], leftM = pts[48], rightM = pts[54];
            const mouthOpen = Math.hypot(topInner.x - bottomInner.x, topInner.y - bottomInner.y) / (Math.hypot(rightM.x - leftM.x, rightM.y - leftM.y) || 1);

            let score = 0, passFrame = false;

            if (type === "senyum") {
              score = happy; passFrame = score >= threshold;
            } else if (type === "lihat_kanan") {
              const deg = -pose.yaw; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg;
            } else if (type === "lihat_kiri") {
              const deg = pose.yaw; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg;
            } else if (type === "lihat_bawah") {
              const deg = -pose.pitch; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg;
            } else if (type === "lihat_atas") {
              const deg = pose.pitch; score = Math.max(0, Math.min(1, deg / thresholdDeg)); passFrame = deg >= thresholdDeg;
            } else if (type === "buka_mulut") {
              score = Math.max(0, Math.min(1, mouthOpen / thresholdMouth)); passFrame = mouthOpen >= thresholdMouth;
            } else if (type === "kedip") {
              const leftEAR = eyeAspectRatio(pts, LEFT_EYE);
              const rightEAR = eyeAspectRatio(pts, RIGHT_EYE);
              const ear = (leftEAR + rightEAR) / 2;
              earRef.current = ear;

              if (!blinkState.current.closed) {
                if (!haveBaselineRef.current) {
                  baselineEarRef.current = ear;
                  haveBaselineRef.current = true;
                } else {
                  baselineEarRef.current = 0.9 * baselineEarRef.current + 0.1 * ear;
                }
              }

              if (haveBaselineRef.current) {
                const baseline = baselineEarRef.current;
                const CLOSED_T = baseline * 0.9;
                const OPEN_T = baseline * 0.97;
                const MIN_CLOSED_FRAMES = 1;
                const drop = Math.max(0, (baseline - ear) / Math.max(1e-6, baseline));
                score = Math.min(1, drop / (1 - 0.9));

                if (!blinkState.current.closed) {
                  if (ear < CLOSED_T) {
                    blinkState.current.closed = true;
                    blinkClosedFrames.current = 1;
                  }
                } else {
                  if (ear < CLOSED_T) blinkClosedFrames.current += 1;
                  if (ear > OPEN_T && blinkClosedFrames.current >= MIN_CLOSED_FRAMES) {
                    blinkState.current.closed = false;
                    blinkClosedFrames.current = 0;
                    passFrame = true; score = 1;
                  }
                }
              }
            } else if (type === "geleng_kepala") {
              yawHistory.current.push(pose.yaw);
              if (yawHistory.current.length > 20) yawHistory.current.shift();
              const minYaw = Math.min(...yawHistory.current), maxYaw = Math.max(...yawHistory.current);
              const yawRange = maxYaw - minYaw;
              score = Math.min(1, yawRange / (thresholdDeg * 2));
              passFrame = yawRange >= thresholdDeg * 2;
            }

            framesRef.current++; setFrames(framesRef.current);
            if (passFrame) { matchedRef.current++; setMatched(matchedRef.current); }
            if (score > bestScoreRef.current) { bestScoreRef.current = score; setBestScore(score); }

            const now = performance.now();
            if (now - (lastLog.current || 0) > 500) {
              onLog?.(`Frame#${framesRef.current} yaw=${pose.yaw.toFixed(1)} pitch=${pose.pitch.toFixed(1)}${type === "kedip" ? ` EAR=${earRef.current.toFixed(3)} BL=${baselineEarRef.current.toFixed(3)}` : ""} score=${score.toFixed(2)} ${passFrame ? "✓" : ""}`);
              lastLog.current = now;
            }
          }
        } catch (e) { console.error(e); }

        const elapsed = performance.now() - startAt;
        setCountdown(durationSec - elapsed / 1000);
        if (elapsed >= durationSec * 1000 && !finishedRef.current) {
          finishedRef.current = true;
          onResult({
            type,
            success: matchedRef.current > 0,
            score: bestScoreRef.current,
            frames: framesRef.current,
            matchedFrames: matchedRef.current
          });
          onClose("auto");
          stop();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (videoRef.current) (videoRef.current as any).srcObject = null;
      started.current = false;
    };

    start();
    return () => stop();
  }, [open, type, durationSec, threshold, thresholdDeg, thresholdMouth, ready, faceapi, options]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => onClose("cancel")} />
      <div className="relative h-full w-full p-4 md:p-8 flex items-center justify-center">
        <div className="relative h-full w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl bg-black ring-1 ring-white/10">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-x-0 top-0 p-4 md:p-6 text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 backdrop-blur">
              <span className="text-sm/5 opacity-80">Verifikasi</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold">{readableType(type)}</span>
            </div>
          </div>
          <div className="absolute inset-0">
            <VideoHUD countdown={countdown} bestScore={bestScore} />
          </div>
          <div className="absolute left-4 bottom-24 md:bottom-8 text-white/90 text-sm md:text-base space-y-1">
            {!ready && <div className="rounded-lg bg-white/10 px-3 py-1">Memuat model…</div>}
            {error && <div className="rounded-lg bg-red-500/80 px-3 py-1">{error}</div>}
            <div className="rounded-lg bg-white/10 px-3 py-1">
              {type === "kedip" && <>EAR: {earRef.current.toFixed(3)} • BL: {baselineEarRef.current.toFixed(3)} • </>}
              Skor terbaik: {bestScore.toFixed(2)} • Frame: {frames} • Match: {matched}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-6xl p-4 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="hidden md:flex items-center gap-2 text-white/80 text-sm">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/90 animate-pulse" />
                  <span>Kamera aktif selama challenge</span>
                </div>
                <button onClick={() => onClose("cancel")} className="px-4 py-2 rounded-xl bg-white/90 hover:bg-white text-gray-900 shadow">Batal</button>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
        </div>
      </div>
    </div>
  );
}