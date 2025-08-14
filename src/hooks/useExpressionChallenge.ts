"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFaceApi } from "@/hooks/useFaceApi";
import { ChallengeResult, ChallengeType, Point } from "@/interface/challenge";
import { estimateHeadPoseFrom68 } from "@/utils/helpers/pose";
import { useCamera } from "@/providers/CameraProvider";
import { createBlinkState } from "@/utils/helpers/blink";
import { detectForType, Thresholds, RepeatState } from "@/utils/helpers/detectors";

export type ChallengeState = {
  frames: number;
  matched: number;
  bestScore: number;
  countdown: number;
  hint: string;
  ear?: number;
  baselineEar?: number;
};

export function useExpressionChallenge(
  type: ChallengeType,
  opts: {
    open: boolean;
    durationSec: number;
    threshold: number;
    thresholdDeg: number;
    thresholdMouth: number;
    onResult: (r: ChallengeResult) => void;
    onClose: (reason: "auto" | "cancel") => void;
    onLog?: (line: string) => void;
  }
) {
  const { faceapi, ready, error } = useFaceApi();
  const options = useMemo(() => {
    if (!faceapi) return null;
    return new (faceapi as any).TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.6
    });
  }, [faceapi]);

  const { ensureStream } = useCamera();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedMeta = useRef(false);

  const rafRef = useRef(0);
  const started = useRef(false);
  const finishedRef = useRef(false);

  const framesRef = useRef(0);
  const matchedRef = useRef(0);
  const bestScoreRef = useRef(0);

  const blink = useRef(createBlinkState());
  const yawHistory = useRef<number[]>([]);
  const pitchHistory = useRef<number[]>([]);
  const smileToggle = useRef(false);
  const smileCyclesRef = useRef(0);

  const repeatStateRef = useRef<RepeatState>({});

  const [state, setState] = useState<ChallengeState>({
    frames: 0,
    matched: 0,
    bestScore: 0,
    countdown: opts.durationSec,
    hint: ""
  });

  useEffect(() => {
    if (!opts.open || started.current || !ready || !faceapi || !options) return;
    started.current = true;
    finishedRef.current = false;

    opts.onLog?.(`Mulai challenge: ${type} (${opts.durationSec}s)`);

    let stream: MediaStream | null = null;
    let startAt = 0;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const v = videoRef.current;
      if (v) {
        try { v.pause(); } catch {}
        (v as any).srcObject = null;
      }

      if (stream) {
        try {
          stream.getTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        } finally {
          stream = null;
        }
      }
      started.current = false; 
    };

    const teardown = () => {
      stop();
    };

    const start = async () => {
      const v = videoRef.current!;
      v.setAttribute("playsinline", "true");
      v.muted = true;
      v.autoplay = true;
      stream = await ensureStream(true);
      loadedMeta.current = false;
      v.onloadedmetadata = async () => {
        loadedMeta.current = true;
        try { await v.play(); } catch {}
      };
      v.oncanplay = () => { loadedMeta.current = true; };
      (v as any).srcObject = stream as any;

      framesRef.current = matchedRef.current = bestScoreRef.current = 0;
      blink.current = createBlinkState();
      yawHistory.current = [];
      pitchHistory.current = [];
      smileToggle.current = false;
      smileCyclesRef.current = 0;
      repeatStateRef.current = {};

      setState({
        frames: 0,
        matched: 0,
        bestScore: 0,
        countdown: opts.durationSec,
        hint: ""
      });
      startAt = performance.now();

      const thresholds: Thresholds = {
        threshold: opts.threshold,
        thresholdDeg: opts.thresholdDeg,
        thresholdMouth: opts.thresholdMouth,
        requiredRepeats: 2
      };

      const tick = async () => {
        const elapsed = performance.now() - startAt;
        const remain = Math.max(0, opts.durationSec - elapsed / 1000);
        setState(s => ({ ...s, countdown: remain }));

        if (elapsed >= opts.durationSec * 1000 && !finishedRef.current) {
          finishedRef.current = true;
          opts.onResult({
            type,
            success: matchedRef.current > 0,
            score: bestScoreRef.current,
            frames: framesRef.current,
            matchedFrames: matchedRef.current
          });
          opts.onClose("auto");
          stop();
          return;
        }

        if (!videoRef.current || !loadedMeta.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        try {
          let main: any = null;
          if (type === "kedip") {
            const det = await (faceapi as any)
              .detectSingleFace(videoRef.current, options)
              .withFaceLandmarks();
            if (det) main = det;
          } else {
            const det = await (faceapi as any)
              .detectAllFaces(videoRef.current, options)
              .withFaceLandmarks()
              .withFaceExpressions();
            main = det?.[0] || null;
          }

          if (main) {
            const pts = main.landmarks.positions.map((p: any) => ({ x: p.x, y: p.y })) as Point[];
            const pose = estimateHeadPoseFrom68(pts);

            const fr = detectForType(
              type,
              {
                pts,
                expressions: main.expressions ?? null,
                blink: blink.current,
                yawHistory: yawHistory.current,
                pitchHistory: pitchHistory.current,
                repeatState: repeatStateRef.current
              },
              thresholds
            );

            yawHistory.current.push(pose.yaw);
            if (yawHistory.current.length > 20) yawHistory.current.shift();
            pitchHistory.current.push(pose.pitch);
            if (pitchHistory.current.length > 20) pitchHistory.current.shift();

            if (type === "geleng_kepala") {
              const minYaw = Math.min(...yawHistory.current);
              const maxYaw = Math.max(...yawHistory.current);
              const yawRange = maxYaw - minYaw;
              fr.score = Math.min(1, yawRange / (thresholds.thresholdDeg * 2));
              fr.passFrame = yawRange >= thresholds.thresholdDeg * 2;
              fr.hint = fr.passFrame ? "Rentang cukup. Berhenti." : "Goyangkan kepala kiri↔kanan sedikit lebih lebar.";
            }

            if (type === "anggukan_kepala") {
              const minP = Math.min(...pitchHistory.current);
              const maxP = Math.max(...pitchHistory.current);
              const pRange = maxP - minP;
              fr.score = Math.min(1, pRange / (thresholds.thresholdDeg * 2));
              fr.passFrame = pRange >= thresholds.thresholdDeg * 2;
              fr.hint = fr.passFrame ? "Rentang cukup. Berhenti." : "Anggukkan kepala sedikit lebih lebar.";
            }

            if (type === "senyum_netral") {
              const isSmile = fr.score >= thresholds.threshold;
              if (isSmile && !smileToggle.current) smileToggle.current = true;
              if (!isSmile && smileToggle.current) {
                smileToggle.current = false;
                smileCyclesRef.current += 1;
              }
              fr.passFrame = smileCyclesRef.current >= 2;
              fr.hint = fr.passFrame ? "Dua siklus terdeteksi." : "Senyum lalu kembali netral (2x).";
            }

            framesRef.current++;
            if (fr.passFrame) matchedRef.current++;
            if (fr.score > bestScoreRef.current) bestScoreRef.current = fr.score;

            setState({
              frames: framesRef.current,
              matched: matchedRef.current,
              bestScore: bestScoreRef.current,
              countdown: remain,
              hint: fr.hint,
              ear: fr.debug?.ear,
              baselineEar: fr.debug?.baseline
            });

            if (opts.onLog) {
              const dbg = fr.debug
                ? ` EAR=${(fr.debug.ear ?? 0).toFixed(3)} BL=${(fr.debug.baseline ?? 0).toFixed(3)}`
                : "";
              opts.onLog(
                `Frame#${framesRef.current} yaw=${pose.yaw.toFixed(1)} pitch=${pose.pitch.toFixed(1)} score=${fr.score.toFixed(2)} ${fr.passFrame ? "✓" : ""}${dbg}`
              );
            }
          }
        } catch (e) {
          console.error(e);
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    start();
    return () => teardown();
  }, [
    opts.open,
    type,
    opts.durationSec,
    opts.threshold,
    opts.thresholdDeg,
    opts.thresholdMouth,
    ready,
    faceapi,
    options
  ]);

  return { videoRef, state, ready, error } as const;
}