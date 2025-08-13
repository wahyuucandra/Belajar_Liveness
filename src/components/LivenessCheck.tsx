"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
// ❗️Jangan import face-api di top-level agar tidak dieksekusi di SSR
// import * as faceapi from "@vladmandic/face-api";
import { useLivenessWS } from "@/hooks/useLivenessWS";
import { createSession, startSession, type Gesture } from "@/lib/api";

/**
 * FaceAPI-powered liveness detection (Next.js-safe)
 * - Dynamic import @vladmandic/face-api hanya di client untuk hindari error
 *   "this.util.TextEncoder is not a constructor" saat SSR.
 * - Kompatibel dengan phase machine & streaming frame via WS.
 */

type ChallengeMsg = {
  type: "challenge_start";
  challenge_id: string;
  gesture: Gesture;
  duration_ms: number;
  deadline_ms?: number;
};

type FinalResultMsg = {
  type: "final_result";
  status: "PASSED" | "FAILED";
  details?: any;
};

type ChallengeProgress = {
  satisfied: boolean;
  score?: number;
  detectedGesture?: Gesture;
  message?: string;
};

// === NEW: phase machine ===
type Phase =
  | "idle" // belum ada challenge
  | "pre_challenge" // jeda sebelum mulai kirim frame
  | "in_challenge" // sedang kirim frame
  | "post_challenge" // jeda setelah selesai (show notif)
  | "completed"; // final_result diterima

const DEFAULT_MODEL_URL =
  process.env.NEXT_PUBLIC_FACEAPI_MODEL_URL ||
  "https://vladmandic.github.io/face-api/model/"; // hosts ssd_mobilenetv1 / tiny / landmarks / expressions

export default function LivenessCheck() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // face-api akan diisi setelah dynamic import
  const faceapiRef = useRef<any>(null);

  const [sessionId, setSessionId] = useState<string>("");
  const [wsToken, setWsToken] = useState<string>("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [challenge, setChallenge] = useState<ChallengeMsg | null>(null);
  const [queuedChallenge, setQueuedChallenge] = useState<ChallengeMsg | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResultMsg | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [modelsReady, setModelsReady] = useState(false);
  const [modelInfo, setModelInfo] = useState<string>("loading models…");

  // jeda (ms)
  const PRE_DELAY = 1500; // sebelum mulai kirim frame
  const POST_DELAY = 1800; // setelah sukses/gagal sebelum next challenge

  const niceGesture = (g?: Gesture) => {
    switch (g) {
      case "SMILE":
        return "Senyum";
      case "MOUTH_OPEN":
        return "Buka mulut";
      case "BLINK":
        return "Kedipkan mata";
      case "LOOK_LEFT":
        return "Lihat ke kiri";
      case "LOOK_RIGHT":
        return "Lihat ke kanan";
      case "HEAD_NOD":
        return "Anggukkan kepala";
      case "HEAD_SHAKE":
        return "Gelengkan kepala";
      default:
        return g || "";
    }
  };

  const {
    status: wsStatus,
    connected,
    lastMsg,
    logs,
    sendJSON,
    reopen,
    close,
    url,
  } = useLivenessWS(
    process.env.NEXT_PUBLIC_API_BASE_URL!,
    sessionId,
    wsToken,
    {
      autoReconnect: true,
      maxRetries: 5,
      pingIntervalMs: 15_000,
      onMessage: (m) => {
        if (m?.type === "challenge_start") {
          const incoming: ChallengeMsg = {
            type: "challenge_start",
            challenge_id: m.challenge_id,
            gesture: m.gesture,
            duration_ms: m.duration_ms,
            deadline_ms: m.deadline_ms,
          };

          if (
            phase === "in_challenge" ||
            phase === "post_challenge" ||
            phase === "pre_challenge"
          ) {
            setQueuedChallenge(incoming);
            return;
          }

          setChallenge(incoming);
          setChallengeProgress(null);
          setToast("");
          setPhase("pre_challenge");
          setSending(false);

          window.setTimeout(() => {
            setPhase("in_challenge");
            setSending(true);
          }, PRE_DELAY);

          return;
        }

        if (m?.type === "final_result") {
          setFinalResult(m as FinalResultMsg);
          setSending(false);
          setPhase("completed");
          return;
        }
      },
      onEvent: (e) => {
        if (e.type === "closed" || e.type === "error") {
          setSending(false);
        }
      },
    }
  );

  // === Init camera ===
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Kamera error:", err);
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // === Dynamic import FaceAPI models only on client ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return; // SSR guard
      try {
        setModelInfo("loading models…");
        const mod = await import("@vladmandic/face-api");
        if (cancelled) return;
        faceapiRef.current = mod;
        await mod.nets.tinyFaceDetector.loadFromUri(DEFAULT_MODEL_URL);
        await mod.nets.faceLandmark68Net.loadFromUri(DEFAULT_MODEL_URL);
        await mod.nets.faceExpressionNet.loadFromUri(DEFAULT_MODEL_URL);
        setModelInfo("warming up…");
        if (videoRef.current) {
          await mod
            .detectSingleFace(
              videoRef.current,
              new mod.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
            )
            .withFaceLandmarks()
            .withFaceExpressions();
        }
        if (!cancelled) {
          setModelsReady(true);
          setModelInfo("models ready");
        }
      } catch (e) {
        console.error("FaceAPI load error", e);
        if (!cancelled) setModelInfo("failed to load face-api models");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // === Frame helper for WS ===
  const grabFramePayload = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0 || v.videoHeight === 0) return null;
    const targetW = 256;
    const scale = targetW / v.videoWidth;
    const w = targetW;
    const h = Math.round(v.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    const rawB64 = dataUrl.split(",")[1];
    return { type: "frame", image_b64: rawB64, content_type: "image/jpeg" };
  };

  // === Local gesture detection using FaceAPI ===
  const TH = useMemo(
    () => ({
      smile: 0.7, // face-expression "happy"
      mouthOpen: 0.3, // ratio
      blinkEAR: 0.2, // eye aspect ratio
      lookYaw: 0.18, // horizontal nose offset ratio
      nodPitchDelta: 0.06, // vertical nose delta ratio in window
      shakeYawDelta: 0.1, // horizontal delta ratio in window
      satisfyMs: 1200, // hold for ~1.2s unless BLINK
      blinkHoldMs: 250, // blink can be momentary
    }),
    []
  );

  const stateRef = useRef({
    lastBlinkAt: 0,
    satisfiedSince: 0,
    yawHistory: [] as number[],
    pitchHistory: [] as number[],
    tsHistory: [] as number[],
  });

  function ear(eye: any[]) {
    const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    return (
      (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2.0 * dist(eye[0], eye[3]))
    );
  }

  function mouthOpenRatio(mouth: any[]) {
    const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    const vertical = d(mouth[14], mouth[18]);
    const horizontal = d(mouth[12], mouth[16]);
    return horizontal > 0 ? vertical / horizontal : 0;
  }

  function yawPitchFromLandmarks(lm: any): { yaw: number; pitch: number } {
    const nose = lm.getNose();
    const jaw = lm.getJawOutline();
    const leftCheek = jaw[2];
    const rightCheek = jaw[14];
    const noseTip = nose[3];

    const faceWidth = Math.max(
      1,
      Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y)
    );
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
    const yaw = (noseTip.x - faceCenterX) / faceWidth; // left -, right +

    const leftEye = lm.getLeftEye();
    const rightEye = lm.getRightEye();
    const eyeLineY = (leftEye[1].y + rightEye[1].y + leftEye[5].y + rightEye[5].y) / 4;
    const chinY = jaw[8].y;
    const faceHeight = Math.max(1, Math.abs(chinY - eyeLineY));
    const pitch = (noseTip.y - eyeLineY) / faceHeight; // up -, down +

    return { yaw, pitch };
  }

  function describeGesture(
    g: Gesture,
    exp: any | undefined,
    lm: any | undefined,
    now: number
  ) {
    if (!lm) return { satisfied: false, score: 0, detected: undefined as Gesture | undefined, message: "Mendeteksi…" };

    const leftEye = lm.getLeftEye();
    const rightEye = lm.getRightEye();
    const mouth = lm.getMouth();
    const { yaw, pitch } = yawPitchFromLandmarks(lm);

    // history for motion gestures
    const S = stateRef.current;
    S.yawHistory.push(yaw);
    S.pitchHistory.push(pitch);
    S.tsHistory.push(now);
    if (S.yawHistory.length > 30) {
      S.yawHistory.shift();
      S.pitchHistory.shift();
      S.tsHistory.shift();
    }

    let score = 0;
    let satisfied = false;
    let msg = "Mendeteksi…";

    switch (g) {
      case "SMILE": {
        const happy = exp?.happy ?? 0;
        score = happy;
        satisfied = happy >= TH.smile;
        msg = satisfied ? "Senyum terdeteksi" : "Ayo senyum lebar 😊";
        break;
      }
      case "MOUTH_OPEN": {
        const r = mouthOpenRatio(mouth);
        score = Math.min(1, (r - 0.1) / 0.5);
        satisfied = r >= TH.mouthOpen;
        msg = satisfied ? "Mulut terbuka" : "Buka mulut";
        break;
      }
      case "BLINK": {
        const leftEAR = ear(leftEye);
        const rightEAR = ear(rightEye);
        const e = Math.min(leftEAR, rightEAR);
        if (e < TH.blinkEAR) stateRef.current.lastBlinkAt = now;
        const dt = now - stateRef.current.lastBlinkAt;
        score = Math.max(0, (TH.blinkHoldMs - dt) / TH.blinkHoldMs);
        satisfied = dt <= TH.blinkHoldMs;
        msg = satisfied ? "Kedipan terdeteksi" : "Kedipkan mata";
        break;
      }
      case "LOOK_LEFT": {
        score = Math.min(1, Math.abs(yaw) / TH.lookYaw);
        satisfied = yaw <= -TH.lookYaw;
        msg = satisfied ? "Menoleh kiri" : "Lihat ke kiri";
        break;
      }
      case "LOOK_RIGHT": {
        score = Math.min(1, Math.abs(yaw) / TH.lookYaw);
        satisfied = yaw >= TH.lookYaw;
        msg = satisfied ? "Menoleh kanan" : "Lihat ke kanan";
        break;
      }
      case "HEAD_NOD": {
        const minPitch = Math.min(...stateRef.current.pitchHistory);
        const maxPitch = Math.max(...stateRef.current.pitchHistory);
        const amp = Math.abs(maxPitch - minPitch);
        score = Math.min(1, amp / (TH.nodPitchDelta * 2));
        satisfied = amp >= TH.nodPitchDelta;
        msg = satisfied ? "Anggukan terdeteksi" : "Anggukkan kepala";
        break;
      }
      case "HEAD_SHAKE": {
        const minYaw = Math.min(...stateRef.current.yawHistory);
        const maxYaw = Math.max(...stateRef.current.yawHistory);
        const amp = Math.abs(maxYaw - minYaw);
        score = Math.min(1, amp / (TH.shakeYawDelta * 2));
        satisfied = amp >= TH.shakeYawDelta;
        msg = satisfied ? "Gelengan terdeteksi" : "Gelengkan kepala";
        break;
      }
      default:
        break;
    }

    if (g !== "BLINK") {
      if (satisfied) {
        if (stateRef.current.satisfiedSince === 0) stateRef.current.satisfiedSince = now;
        if (now - stateRef.current.satisfiedSince >= TH.satisfyMs) {
          // ok
        } else {
          satisfied = false;
        }
      } else {
        stateRef.current.satisfiedSince = 0;
      }
    }

    return { satisfied, score, detected: g, message: msg };
  }

  // FaceAPI loop: only when in_challenge && modelsReady
  useEffect(() => {
    if (!modelsReady || phase !== "in_challenge") return;
    let raf = 0;
    let lastEval = 0;

    const tick = async (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (!videoRef.current) return;
      const mod = faceapiRef.current;
      if (!mod) return;
      if (ts - lastEval < 120) return; // ~8 fps eval
      lastEval = ts;

      const det = await mod
        .detectSingleFace(
          videoRef.current,
          new mod.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.5 })
        )
        .withFaceLandmarks()
        .withFaceExpressions();

      if (!det) {
        setChallengeProgress({ satisfied: false, score: 0, message: "Wajah belum terdeteksi" });
        stateRef.current.satisfiedSince = 0;
        return;
      }

      const now = performance.now();
      const lm = det.landmarks;
      const exp = det.expressions;

      if (challenge) {
        const { satisfied, score, detected, message } = describeGesture(
          challenge.gesture,
          exp,
          lm,
          now
        );

        setChallengeProgress({ satisfied, score, detectedGesture: detected, message });

        if (satisfied) {
          setSending(false);
          setToast(`✅ ${niceGesture(challenge.gesture)} terdeteksi!`);
          setPhase("post_challenge");

          try {
            sendJSON({ type: "gesture_detected", gesture: challenge.gesture, satisfied: true, score });
          } catch {}

          window.setTimeout(() => {
            setToast("");
            stateRef.current = {
              lastBlinkAt: 0,
              satisfiedSince: 0,
              yawHistory: [],
              pitchHistory: [],
              tsHistory: [],
            };
            if (queuedChallenge) {
              setChallenge(queuedChallenge);
              setQueuedChallenge(null);
              setChallengeProgress(null);
              setPhase("pre_challenge");
              window.setTimeout(() => {
                setPhase("in_challenge");
                setSending(true);
              }, PRE_DELAY);
            } else {
              setChallenge(null);
              setChallengeProgress(null);
              setPhase("idle");
            }
          }, POST_DELAY);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modelsReady, phase, challenge]);

  // === Send frames via WS only during in_challenge ===
  useEffect(() => {
    if (!connected || !sending || phase !== "in_challenge") return;
    let t: number | null = null;
    const tick = () => {
      const payload = grabFramePayload();
      if (payload) sendJSON(payload);
      t = window.setTimeout(tick, 280);
    };
    tick();
    return () => {
      if (t) window.clearTimeout(t);
    };
  }, [connected, sending, phase, sendJSON]);

  // === Start/Stop ===
  const onStart = async () => {
    setPhase("idle");
    setChallenge(null);
    setQueuedChallenge(null);
    setChallengeProgress(null);
    setFinalResult(null);
    setToast("");

    try {
      const session = await createSession({
        user_id: "dev-user",
        gestures: ["MOUTH_OPEN", "SMILE"],
        challenge_count: 2,
        challenge_min_duration_ms: 1500,
        challenge_max_duration_ms: 2500,
        overall_timeout_ms: 60_000,
      });

      setSessionId(session.session_id);
      setWsToken(session.ws_token);

      await startSession(session.session_id);
    } catch (e) {
      console.error("Create/start session error:", e);
      setSending(false);
      setPhase("idle");
    }
  };

  const onStop = () => {
    setSending(false);
    setPhase("idle");
    setQueuedChallenge(null);
    close(1000, "user stopped");
  };

  return (
    <div className="p-4 grid gap-4">
      <h1 className="text-xl font-bold">Liveness Detection (FaceAPI)</h1>

      <video ref={videoRef} className="border w-80 rounded" playsInline muted />

      <div className="flex gap-2">
        <button
          onClick={onStart}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={phase !== "idle" && phase !== "completed"}
        >
          Mulai Liveness Check
        </button>
        <button onClick={onStop} className="bg-gray-700 text-white px-4 py-2 rounded">
          Stop
        </button>
        <button onClick={reopen} className="bg-amber-600 text-white px-4 py-2 rounded">
          Reopen WS
        </button>
      </div>

      <div className="text-sm text-gray-300">
        <div>
          <b>WS status:</b> {wsStatus} {connected ? "✅" : "❌"}
        </div>
        <div className="truncate">
          <b>WS URL:</b> {url || "-"}
        </div>
        <div>
          <b>Session:</b> {sessionId || "-"}
        </div>
        <div>
          <b>Phase:</b> {phase}
        </div>
        <div>
          <b>FaceAPI:</b> {modelInfo}
        </div>
      </div>

      {challenge && (
        <div className="p-3 text-black rounded border bg-yellow-50">
          <h2 className="font-semibold">Instruksi Challenge</h2>
          <p>
            Gesture: <b>{niceGesture(challenge.gesture)}</b>
          </p>
          <p>Durasi target: {challenge.duration_ms} ms</p>
          {phase === "pre_challenge" && (
            <p className="text-gray-700">Mulai dalam {Math.round(PRE_DELAY / 1000)} detik… siap ya!</p>
          )}

          {challengeProgress && typeof challengeProgress.score === "number" && (
            <div className="mt-2">
              <div className="h-2 bg-gray-200 rounded">
                <div
                  className="h-2 bg-green-500 rounded"
                  style={{ width: `${Math.min(100, Math.round((challengeProgress.score || 0) * 100))}%` }}
                />
              </div>
              <div className="text-xs mt-1 text-gray-600">
                Confidence: {Math.round((challengeProgress.score || 0) * 100)}%
              </div>
            </div>
          )}

          {challengeProgress?.message && (
            <div className={`mt-2 text-sm ${challengeProgress.satisfied ? "text-green-700" : "text-gray-700"}`}>
              {challengeProgress.satisfied ? "✅ " : "🟡 "}
              {challengeProgress.message}
            </div>
          )}
        </div>
      )}

      {toast && <div className="px-3 py-2 rounded bg-green-600 text-white shadow w-fit">{toast}</div>}

      {finalResult && (
        <div className="p-3 rounded border bg-green-50">
          <h2 className="font-semibold">Hasil</h2>
          <p>
            Status: <b>{finalResult.status}</b>
          </p>
          <pre className="text-xs bg-white p-2 mt-2 rounded overflow-auto">
            {JSON.stringify(finalResult.details ?? finalResult, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <h3 className="font-semibold">Last message</h3>
        <pre className="text-xs text-black bg-gray-50 p-2 rounded overflow-auto">
          {lastMsg ? JSON.stringify(lastMsg, null, 2) : "-"}
        </pre>
      </div>
    </div>
  );
}