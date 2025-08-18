"use client";

import { useFaceApi } from "@/hooks/useFaceApi";
import React, { useEffect, useMemo, useRef, useState } from "react";

// Utility for timestamp strings
function ts(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// --- Math helpers ---
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mapClamp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const avgPt = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

// --- Types ---
type StepId =
  | "look-left"
  | "blink"
  | "look-right"
  | "smile"
  | "open-mouth"
  | "nod"
  | "tilt"
  | "move-closer";

interface Step {
  id: StepId;
  title: string;
  detail?: string;
  requiredCount: number; // how many detections required to complete
}

interface LogItem {
  time: string;
  level: "info" | "success" | "warn" | "error";
  text: string;
}

// --- Steps definition (8 langkah) ---
const STEPS: Step[] = [
  { id: "look-left", title: "Lihat ke kiri", detail: "Putar kepala ke kiri", requiredCount: 1 },
  { id: "blink", title: "Kedipkan mata • Wajib", detail: "Tutup lalu buka kedua mata dengan jelas", requiredCount: 3 },
  { id: "look-right", title: "Lihat ke kanan", detail: "Putar kepala ke kanan", requiredCount: 1 },
  { id: "smile", title: "Senyum", detail: "Tunjukkan ekspresi senyum", requiredCount: 1 },
  { id: "open-mouth", title: "Buka mulut", detail: "Buka dan tahan sebentar", requiredCount: 1 },
  { id: "nod", title: "Angguk atas/bawah", detail: "Gerakkan kepala naik–turun", requiredCount: 1 },
  { id: "tilt", title: "Miringkan kepala", detail: "Rotasi ke kiri/kanan (roll)", requiredCount: 1 },
  { id: "move-closer", title: "Dekatkan wajah", detail: "Gerakkan wajah mendekat kamera", requiredCount: 1 },
];

export default function Page() {
  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasSampleRef = useRef<HTMLCanvasElement | null>(null); // hidden canvas for brightness sampling
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // overlay canvas (pattern & landmarks/watermark)
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Flow state
  const [activeId, setActiveId] = useState<StepId | null>(null);
  const activeIdRef = useRef<StepId | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  // Snapshot step terpilih agar rekap tetap muncul walau state sudah berubah
  const stepSnapshotRef = useRef<Step | null>(null);

  const [progress, setProgress] = useState<Record<StepId, number>>({
    "look-left": 0,
    blink: 0,
    "look-right": 0,
    smile: 0,
    "open-mouth": 0,
    nod: 0,
    tilt: 0,
    "move-closer": 0,
  });
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [expression, setExpression] = useState("neutral");

  // Realtime lighting heuristics
  const [avgBrightness, setAvgBrightness] = useState<number>(0); // 0-255
  const [tooDark, setTooDark] = useState<boolean>(false);

  // face-api hook
  const { faceapi, ready: faReady, error: faError } = useFaceApi();
  const [facesCount, setFacesCount] = useState<number>(0);

  // === Stats overlay (Skor terbaik • Skor • Frame • Match) ===
  const [stats, setStats] = useState({ best: 0, frame: 0, match: 0, score: 0, sum: 0 });
  const statsRef = useRef({ best: 0, frame: 0, match: 0, score: 0, sum: 0 });
  const [perSecScores, setPerSecScores] = useState<number[]>([]);
  const perSecScoresRef = useRef<number[]>([]);
  const lastStatsUi = useRef(0);

  // Baseline (per-challenge) for pose/motion deltas
  const baselineRef = useRef({
    initialized: false,
    interocular: 0,
    eyeToNose: 0,
    midEyeY: 0,
    noseY: 0,
    bboxArea: 0,
  });

  // AUTO-DETECT controller per langkah
  const SCORE_DETECT_THRESHOLD = 0.85; // skor frame harus >= ini untuk dianggap on-target
  const STREAK_FRAMES = 6; // butuh N frame berturut-turut (~0.5s @12fps)
  const COOLDOWN_FRAMES = 10; // cegah double count dalam 0.8s
  const MATCH_THRESHOLD = 0.85; // ambang frame dianggap match (HUD)
  const streakRef = useRef(0);
  const cooldownRef = useRef(0);
  const gateOnRef = useRef(false); // khusus blink (histeresis)

  // --- Grading rules per step ---
  const PASS_RULES: Record<StepId, { withinSeconds: number; minAvg: number }> = {
    "look-left": { withinSeconds: 5, minAvg: 0.85 },
    blink: { withinSeconds: 7, minAvg: 0.8 },
    "look-right": { withinSeconds: 5, minAvg: 0.85 },
    smile: { withinSeconds: 5, minAvg: 0.9 },
    "open-mouth": { withinSeconds: 5, minAvg: 0.88 },
    nod: { withinSeconds: 6, minAvg: 0.85 },
    tilt: { withinSeconds: 6, minAvg: 0.85 },
    "move-closer": { withinSeconds: 6, minAvg: 0.85 },
  };
  const secondsElapsedRef = useRef<number>(0);
  const successSecRef = useRef<number | null>(null);

  // For recap UI after a step ends
  const [lastRecap, setLastRecap] = useState<{
    title: string;
    scores: number[];
    best: number;
    frame: number;
    match: number;
    score: number;
    avg: number;
    finishedAtSec: number | null;
    result: "SUKSES" | "GAGAL (waktu habis)";
    grade: "LULUS" | "TIDAK LULUS";
    ruleWithinSeconds: number;
    ruleMinAvg: number;
  } | null>(null);

  // Countdown (5 seconds per selection)
  const DURATION = 5; // seconds
  const [countdown, setCountdown] = useState<number>(0);
  const countdownRef = useRef<number>(0);
  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activeStep = useMemo(() => STEPS.find((s) => s.id === activeId) || null, [activeId]);

  // Start/stop countdown helpers
  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetAutoDetectGates = () => {
    streakRef.current = 0;
    cooldownRef.current = 0;
    gateOnRef.current = false;
  };

  const resetChallengeStats = () => {
    statsRef.current = { best: 0, frame: 0, match: 0, score: 0, sum: 0 };
    setStats({ best: 0, frame: 0, match: 0, score: 0, sum: 0 });
    perSecScoresRef.current = [];
    setPerSecScores([]);
    baselineRef.current = { initialized: false, interocular: 0, eyeToNose: 0, midEyeY: 0, noseY: 0, bboxArea: 0 };
    resetAutoDetectGates();
    secondsElapsedRef.current = 0;
    successSecRef.current = null;
  };

  // Logging helper
  const pushLog = (level: LogItem["level"], text: string) => {
    setLogs((prev) => [{ time: ts(), level, text }, ...prev].slice(0, 200));
  };

  // ---------- SUCCESS HANDLER (satu pintu) ----------
  const markStepSuccess = (title: string) => {
    if (!activeStep) return;

    // simpan detik selesai (relative terhadap start challenge)
    if (successSecRef.current === null) {
      successSecRef.current = Math.max(0, Math.min(DURATION, DURATION - countdownRef.current));
    }

    // pastikan progress penuh (✓)
    setProgress((p) => ({ ...p, [activeStep.id]: activeStep.requiredCount }));

    clearTimer();
    // JANGAN timpa `match` di sini; `match` mengikuti frame (lihat loop inferensi)
    setStats({ ...statsRef.current });

    pushLog("success", `Langkah berhasil: ${title} (Progress ${activeStep.requiredCount}/${activeStep.requiredCount})`);
    pushLog(
      "success",
      `Selesai: ${title} • Hasil: SUKSES • Skor terbaik: ${statsRef.current.best.toFixed(2)} • Skor: ${statsRef.current.score.toFixed(2)} • Frame: ${statsRef.current.frame} • Match: ${statsRef.current.match}`
    );

    finalizeRecap("SUKSES");
    setActiveId(null);
  };

  const autoCountIfQualified = (scoreFrame: number) => {
    if (!activeStep || countdownRef.current <= 0) return;

    // Blink pakai histeresis on/off agar tidak flapping
    if (activeStep.id === "blink") {
      const ON = 0.75; // mapped score when eyes are clearly closed
      const OFF = 0.45; // release threshold
      if (!gateOnRef.current && scoreFrame >= ON && cooldownRef.current === 0) {
        gateOnRef.current = true; // rising edge
        // increment
        setProgress((p) => {
          const curr = p[activeStep.id];
          const next = Math.min(activeStep.requiredCount, curr + 1);
          const updated = { ...p, [activeStep.id]: next } as Record<StepId, number>;
          pushLog("info", `Terbaca ${next}/${activeStep.requiredCount} untuk ${activeStep.title}`);
          if (next >= activeStep.requiredCount) markStepSuccess(activeStep.title);
          return updated;
        });
        cooldownRef.current = COOLDOWN_FRAMES;
      } else if (gateOnRef.current && scoreFrame <= OFF) {
        gateOnRef.current = false; // falling edge
      }
      return;
    }

    // Generic streak logic untuk langkah lain
    if (cooldownRef.current > 0) {
      cooldownRef.current -= 1;
      return;
    }

    if (scoreFrame >= SCORE_DETECT_THRESHOLD) {
      streakRef.current += 1;
      if (streakRef.current >= STREAK_FRAMES) {
        setProgress((p) => {
          const curr = p[activeStep.id];
          const next = Math.min(activeStep.requiredCount, curr + 1);
          const updated = { ...p, [activeStep.id]: next } as Record<StepId, number>;
          pushLog("info", `Terbaca ${next}/${activeStep.requiredCount} untuk ${activeStep.title}`);
          if (next >= activeStep.requiredCount) markStepSuccess(activeStep.title);
          return updated;
        });
        streakRef.current = 0;
        cooldownRef.current = COOLDOWN_FRAMES;
      }
    } else {
      streakRef.current = 0;
    }
  };

  // Select a step (auto start countdown and reset ONLY that step's progress)
  const selectStep = (id: StepId) => {
    setActiveId(id);
    setProgress((p) => ({ ...p, [id]: 0 }));
    const s = STEPS.find((x) => x.id === id)!;
    stepSnapshotRef.current = s; // simpan snapshot untuk rekap akhir
    pushLog("info", `Mulai langkah: ${s.title} (batas ${DURATION} dtk)`);
    resetChallengeStats();
    startCountdown();
  };

  const finalizeRecap = (result: "SUKSES" | "GAGAL (waktu habis)") => {
    const step = stepSnapshotRef.current; // gunakan snapshot agar tidak tergantung activeStep
    if (!step) return;

    const avg = statsRef.current.frame > 0 ? statsRef.current.sum / statsRef.current.frame : 0;
    const finishedAt = successSecRef.current; // mungkin null jika tidak selesai
    const progressDone = progressRef.current[step.id] >= step.requiredCount;

    // Ambil rule per-step
    const rule = PASS_RULES[step.id];

    // Kriteria kelulusan:
    // 1) Tugas selesai (progress terpenuhi)
    // 2) Selesai dalam <= rule.withinSeconds
    // 3) Rata-rata skor >= rule.minAvg
    // lulus jika: (selesai sebelum waktu & avg lolos) ATAU (timeout & avg tetap lolos)
    const isPass =
      (progressDone && finishedAt !== null && finishedAt <= rule.withinSeconds && avg >= rule.minAvg) ||
      (!progressDone && avg >= rule.minAvg);

    const recap = {
      title: step.title,
      scores: [...perSecScoresRef.current],
      best: statsRef.current.best,
      frame: statsRef.current.frame,
      match: statsRef.current.match,
      score: statsRef.current.score,
      avg,
      finishedAtSec: finishedAt,
      result,
      grade: isPass ? "LULUS" : "TIDAK LULUS",
      ruleWithinSeconds: rule.withinSeconds,
      ruleMinAvg: rule.minAvg,
    } as const;

    setLastRecap(recap as any);
    pushLog(
      isPass ? "success" : "warn",
      `Rekap: ${step.title} • selesai@${finishedAt ?? "-"}s • avg=${avg.toFixed(2)} • ambang: ≤${rule.withinSeconds}s & ≥${rule.minAvg.toFixed(2)} • grade=${recap.grade}`
    );
    pushLog("info", `Rekap skor/detik: [${recap.scores.map((s) => s.toFixed(2)).join(", ")}]`);
  };

  const startCountdown = () => {
    clearTimer();
    resetChallengeStats();

    setCountdown(DURATION);
    const t = setInterval(() => {
      setCountdown((c) => {
        // snapshot per‑second score BEFORE ticking down (untuk rekap)
        const currentSecondScore = Number(statsRef.current.best.toFixed(2));
        perSecScoresRef.current = [...perSecScoresRef.current, currentSecondScore];
        setPerSecScores(perSecScoresRef.current);
        // HUD "Skor" mengikuti frame; jangan timpa dengan per‑detik
        setStats({ ...statsRef.current });

        // catat detik berjalan
        secondsElapsedRef.current = DURATION - (c ?? 0);

        if (c <= 1) {
          clearTimer();
          if (stepSnapshotRef.current) {
            const step = stepSnapshotRef.current;
            const done = progressRef.current[step.id] >= step.requiredCount;
            if (done) {
              // tegaskan progress penuh (✓) saat sukses di detik terakhir
              setProgress((p) => ({ ...p, [step.id]: step.requiredCount }));
              pushLog(
                "success",
                `Selesai: ${step.title} • Hasil: SUKSES (selesai tepat waktu) • Skor terbaik: ${statsRef.current.best.toFixed(2)} • Skor: ${statsRef.current.score.toFixed(2)} • Frame: ${statsRef.current.frame} • Match: ${statsRef.current.match}`
              );
              finalizeRecap("SUKSES");
            } else {
              pushLog(
                "error",
                `Hasil: GAGAL (waktu habis) untuk ${step.title} • Skor terbaik: ${statsRef.current.best.toFixed(2)} • Skor: ${statsRef.current.score.toFixed(2)} • Frame: ${statsRef.current.frame} • Match: ${statsRef.current.match}`
              );
              finalizeRecap("GAGAL (waktu habis)");
            }
          }
          setActiveId(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    timerRef.current = t;
  };

  // Manual fallback (masih tersedia)
  const markDetected = () => {
    if (!activeStep) return;
    setProgress((p) => {
      const curr = p[activeStep.id];
      const next = Math.min(activeStep.requiredCount, curr + 1);
      const updated = { ...p, [activeStep.id]: next } as Record<StepId, number>;
      if (next >= activeStep.requiredCount) {
        markStepSuccess(activeStep.title);
      } else {
        pushLog("info", `Terbaca ${next}/${activeStep.requiredCount} untuk ${activeStep.title}`);
      }
      return updated;
    });
  };

  // Reset all
  const resetAll = () => {
    clearTimer();
    setActiveId(null);
    setProgress({
      "look-left": 0,
      blink: 0,
      "look-right": 0,
      smile: 0,
      "open-mouth": 0,
      nod: 0,
      tilt: 0,
      "move-closer": 0,
    });
    setLogs([]);
    setStats({ best: 0, frame: 0, match: 0, score: 0, sum: 0 });
    statsRef.current = { best: 0, frame: 0, match: 0, score: 0, sum: 0 };
    perSecScoresRef.current = [];
    setPerSecScores([]);
    baselineRef.current = { initialized: false, interocular: 0, eyeToNose: 0, midEyeY: 0, noseY: 0, bboxArea: 0 };
    setLastRecap(null);
    resetAutoDetectGates();
    secondsElapsedRef.current = 0;
    successSecRef.current = null;
    pushLog("info", "Reset semua status");
  };

  // Camera init
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

  // --- Placeholder expression demo (can be driven by face-api later) ---
  useEffect(() => {
    if (!activeStep) return;
    if (activeStep.id === "smile") setExpression("happy");
    else setExpression("neutral");
  }, [activeStep?.id]);

  // --- Realtime sampling: brightness heuristics ---
  useEffect(() => {
    let raf = 0;
    let lastBrightness = 0;

    const sample = () => {
      const video = videoRef.current;
      const canvas = canvasSampleRef.current;
      if (!video || !canvas || !cameraReady) {
        raf = requestAnimationFrame(sample);
        return;
      }

      const W = 160;
      const H = Math.max(120, Math.floor((video.videoHeight / video.videoWidth) * W) || 120);
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(sample);
        return;
      }
      ctx.drawImage(video, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);

      let sum = 0,
        count = 0;
      for (let i = 0; i < data.length; i += 4 * 6) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += y;
        count++;
      }
      const avg = count ? sum / count : 0;
      const newBrightness = Math.round(avg);
      setAvgBrightness(newBrightness);
      const dark = newBrightness < 50;
      setTooDark(dark);
      if (Math.abs(newBrightness - lastBrightness) >= 20) {
        pushLog("info", `Kecerahan: ${newBrightness}`);
        lastBrightness = newBrightness;
      }

      raf = requestAnimationFrame(sample);
    };

    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [cameraReady]);

  // =============================
  // face-api detection + overlay
  // =============================
  useEffect(() => {
    if (!cameraReady) return;
    const ov = overlayRef.current;
    const video = videoRef.current;
    if (!ov || !video) return;

    const ctx = ov.getContext("2d");
    if (!ctx) return;

    let running = true;
    let rafId = 0;
    let lastDetect = 0;
    let inferInFlight = false;

    // landmark index helpers (dlib-68 order)
    const IDX = {
      leftEye: [36, 37, 38, 39, 40, 41],
      rightEye: [42, 43, 44, 45, 46, 47],
      noseTip: 30,
      mouth: { outerLeft: 48, outerRight: 54, innerTop: 62, innerBottom: 66 },
    };

    const ensureSize = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const w = video.clientWidth || video.videoWidth;
      const h = video.clientHeight || video.videoHeight;
      if (ov.width !== w || ov.height !== h) {
        ov.width = w;
        ov.height = h;
      }
    };

    const drawBaseGuides = (w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      // Soft vignette
      const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    };

    // Face-following watermark (optional visual)
    const drawFaceWatermark = (bb: { x: number; y: number; width: number; height: number }, text = "EKYC VERIFIED") => {
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      const radius = Math.max(bb.width, bb.height) * 0.65;
      const time = performance.now() / 1000;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.6);
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(56,189,248,0.85)";
      ctx.setLineDash([10, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      const repeat = 12;
      ctx.font = `${Math.max(14, Math.round(bb.width * 0.12))}px ui-sans-serif, system-ui`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < repeat; i++) {
        const angle = (i / repeat) * Math.PI * 2;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -radius);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    };

    const eyeEAR = (eye: { x: number; y: number }[]) => {
      // Using 6 points order from dlib: [p1..p6]
      const A = dist(eye[1], eye[5]);
      const B = dist(eye[2], eye[4]);
      const C = dist(eye[0], eye[3]);
      return (A + B) / (2 * C);
    };

    const computeChallengeScore = (
      step: StepId,
      pts: { x: number; y: number }[],
      expr: Record<string, number> | undefined,
      box: { x: number; y: number; width: number; height: number }
    ) => {
      if (!pts || pts.length < 68) return 0;
      const p = (i: number) => pts[i];
      const leftEyePts = IDX.leftEye.map(p);
      const rightEyePts = IDX.rightEye.map(p);
      const leftEyeC = avgPt(leftEyePts);
      const rightEyeC = avgPt(rightEyePts);
      const midEye = { x: (leftEyeC.x + rightEyeC.x) / 2, y: (leftEyeC.y + rightEyeC.y) / 2 };
      const interocular = dist(leftEyeC, rightEyeC);
      const nose = p(IDX.noseTip);

      const innerTop = p(IDX.mouth.innerTop);
      const innerBottom = p(IDX.mouth.innerBottom);
      const mouthOpenRaw = dist(innerTop, innerBottom);
      const outerLeft = p(IDX.mouth.outerLeft);
      const outerRight = p(IDX.mouth.outerRight);
      const mouthWidth = dist(outerLeft, outerRight);

      const rollRad = Math.atan2(rightEyeC.y - leftEyeC.y, rightEyeC.x - leftEyeC.x);

      // initialize baseline lazily per challenge
      if (activeIdRef.current && countdownRef.current > 0 && !baselineRef.current.initialized) {
        baselineRef.current = {
          initialized: true,
          interocular,
          eyeToNose: Math.abs(nose.y - midEye.y),
          midEyeY: midEye.y,
          noseY: nose.y,
          bboxArea: box.width * box.height,
        };
        pushLog("info", "Baseline terkunci");
      }

      const base = baselineRef.current;
      const dxNorm = interocular > 0 ? (nose.x - midEye.x) / interocular : 0; // +right, -left
      const mouthOpenNorm = interocular > 0 ? mouthOpenRaw / interocular : 0;
      const eyeToNose = Math.abs(nose.y - midEye.y);
      const eyeToNoseRel = base.interocular > 0 ? (eyeToNose - base.eyeToNose) / base.interocular : 0;
      const area = box.width * box.height;
      const areaGrow = base.bboxArea > 0 ? area / base.bboxArea - 1 : 0;
      const earL = eyeEAR(leftEyePts);
      const earR = eyeEAR(rightEyePts);
      const earAvg = (earL + earR) / 2;

      switch (step) {
        case "look-left": {
          // Want dxNorm negative (nose to left of eye-mid). Deadzone 0.05, full at -0.25
          return mapClamp(-dxNorm, 0.05, 0.25);
        }
        case "look-right": {
          // Want dxNorm positive. Deadzone 0.05, full at +0.25
          return mapClamp(dxNorm, 0.05, 0.25);
        }
        case "tilt": {
          // Use roll angle magnitude: deadzone 5°, full at 20°
          const deg = Math.abs((rollRad * 180) / Math.PI);
          return mapClamp(deg, 5, 20);
        }
        case "blink": {
          // Blink when EAR is low. Typical threshold ~0.20-0.25
          return mapClamp(0.26 - earAvg, 0.0, 0.12);
        }
        case "open-mouth": {
          // Inner lip opening relative to interocular; full at ~0.22
          return mapClamp(mouthOpenNorm, 0.06, 0.22);
        }
        case "smile": {
          // Use expression if available, else fallback to mouth aspect (width vs inner height)
          const exprHappy = expr?.happy ?? 0;
          const mouthSmileProxy = mouthWidth > 0 ? clamp01((mouthWidth / (interocular + 1e-6) - 1.2) / 0.6) : 0;
          return Math.max(exprHappy, mouthSmileProxy);
        }
        case "nod": {
          // Up/down movement: change of eye-to-nose distance vs baseline. Full at ~8% interocular change
          return clamp01(Math.abs(eyeToNoseRel) / 0.08);
        }
        case "move-closer": {
          // Grow bbox area vs baseline. Full when +40% area
          return mapClamp(areaGrow, 0.1, 0.4);
        }
        default:
          return 0;
      }
    };

    const loop = async () => {
      if (!running) return;
      ensureSize();
      const w = ov.width;
      const h = ov.height;
      drawBaseGuides(w, h);

      const now = performance.now();
      const canInfer = faReady && faceapi && !inferInFlight && now - lastDetect > 80; // ~12 FPS

      if (canInfer) {
        try {
          inferInFlight = true;
          lastDetect = now;

          const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.5 });
          const res = await faceapi
            .detectAllFaces(video, opts)
            .withFaceLandmarks()
            .withFaceExpressions();

          // === Update face count for UI ===
          setFacesCount(res.length);

          let challengeScoreThisFrame = 0;
          if (res.length > 0) {
            const sorted = res.sort((a: any, b: any) => b.detection.box.area - a.detection.box.area);
            const best = sorted[0];
            const box = best.detection.box; // { x, y, width, height }
            const pts = (best.landmarks?.positions || []) as { x: number; y: number }[];

            // Expressions → UI (for display only)
            const expr = best.expressions || {};
            let topExpr = "neutral";
            let topVal = 0;
            for (const k of Object.keys(expr)) {
              const v = (expr as any)[k];
              if (typeof v === "number" && v > topVal) {
                topVal = v;
                topExpr = k as string;
              }
            }
            setExpression(topExpr);

            // === Challenge-specific scoring ===
            if (activeIdRef.current && countdownRef.current > 0 && pts?.length) {
              challengeScoreThisFrame = computeChallengeScore(activeIdRef.current, pts, expr as any, box);

              // Auto progress detection here
              autoCountIfQualified(challengeScoreThisFrame);

              // Optional watermark that follows face (comment out if not needed)
              // drawFaceWatermark(box);
            }
          }

          // === Stats mengikuti frame ===
          if (activeIdRef.current && countdownRef.current > 0) {
            statsRef.current.frame += 1; // total frame selama challenge
            statsRef.current.score = challengeScoreThisFrame; // skor HUD = frame terkini
            statsRef.current.sum += challengeScoreThisFrame; // akumulasi untuk rata-rata
            statsRef.current.match = challengeScoreThisFrame >= MATCH_THRESHOLD ? 1 : 0; // match mengikuti frame
            if (challengeScoreThisFrame > statsRef.current.best) statsRef.current.best = challengeScoreThisFrame; // best sepanjang challenge

            // throttle UI updates (200ms)
            if (now - lastStatsUi.current > 200) {
              lastStatsUi.current = now;
              setStats({ ...statsRef.current });
            }
          }
        } catch (e) {
          // keep loop alive
        } finally {
          inferInFlight = false;
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    loop();
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [cameraReady, faReady, faceapi]);

  // Progress percentage for active step
  const activePct = activeStep ? Math.round((progress[activeStep.id] / activeStep.requiredCount) * 100) : 0;

  const faceDetected = facesCount > 0; // UI glow only when at least one face detected

  return (
    <div className="relative min-h-screen text-slate-100 p-4 sm:p-6 overflow-hidden">
      {/* Fancy animated background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 40%, white 1.5px, transparent 1.5px), radial-gradient(circle at 60% 80%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px, 60px 60px, 50px 50px",
        }}
      />
      <div
        className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full blur-3xl opacity-30"
        style={{
          background:
            "conic-gradient(from 180deg at 50% 50%, rgba(56,189,248,0.6), rgba(99,102,241,0.5), rgba(16,185,129,0.5), rgba(56,189,248,0.6))",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <h1 className="text-2xl sm:text-3xl font-semibold">Verifikasi Wajah (eKYC)</h1>
        {faError && <div className="mt-2 text-sm text-amber-300">Gagal memuat model face-api: {faError}</div>}
        {!faError && !faReady && <div className="mt-2 text-sm text-slate-300">Memuat model face-api…</div>}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left: Camera preview & controls */}
          <div className="lg:col-span-2">
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

              {/* Overlay canvas for watermark & landmarks */}
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />

              {!cameraReady && (
                <div className="absolute inset-0 grid place-items-center text-slate-300 bg-slate-900/60 backdrop-blur">
                  <div className="text-center">
                    <div className="animate-pulse text-sm">Mengaktifkan kamera…</div>
                    {cameraError && <div className="text-red-300 mt-2">{cameraError}</div>}
                  </div>
                </div>
              )}

              {/* Floating hint for the active step */}
              {activeStep && (
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur rounded-xl px-4 py-3 text-sm">
                  <div className="font-medium">
                    {activeStep.title} ( {progress[activeStep.id]} / {activeStep.requiredCount} )
                  </div>
                  <div className="text-slate-300">{activeStep.detail}</div>
                </div>
              )}

              {/* === Stats pill overlay (bottom-right) === */}
              {activeStep && (
                <div className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-2xl bg-black/70 text-slate-100 text-sm border border-white/10 shadow max-w-[70%]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>Skor terbaik: {stats.best.toFixed(2)}</span>
                    <span className="mx-1">•</span>
                    <span>Skor: {stats.score.toFixed(2)}</span>
                    <span className="mx-1">•</span>
                    <span>Frame: {stats.frame}</span>
                    <span className="mx-1">•</span>
                    <span>Match: {stats.match}</span>
                  </div>
                </div>
              )}

              {/* Countdown bubble */}
              {activeStep && (
                <div className="absolute top-4 right-4 bg-black/70 rounded-full w-12 h-12 sm:w-14 sm:h-14 grid place-items-center text-lg sm:text-xl font-semibold">
                  {String(countdown || DURATION)}
                </div>
              )}

              {/* No detection / too dark overlay */}
              {cameraReady && (
                <div className="absolute top-4 left-4 space-y-1">
                  {!faceDetected && !tooDark && (
                    <div className="px-3 py-1.5 text-xs rounded-lg bg-slate-900/70 border border-slate-600 text-slate-200">Wajah belum terdeteksi</div>
                  )}
                  {tooDark && (
                    <div className="px-3 py-1.5 text-xs rounded-lg bg-amber-900/60 border border-amber-500 text-amber-200">Terlalu gelap — tambahkan cahaya</div>
                  )}
                  <div className="px-2 py-0.5 text[11px] rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200">
                    face-api: {faReady ? `aktif • ${facesCount} wajah` : "memuat…"}
                  </div>
                </div>
              )}
            </div>

            {/* Controls below camera & log */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={markDetected}
                disabled={!activeStep}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-400 hover:bg-emerald-500 transition"
              >
                Tandai Terdeteksi
              </button>
              <button
                onClick={startCountdown}
                disabled={!activeStep}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sky-600 disabled:bg-slate-700 disabled:text-slate-400 hover:bg-sky-500 transition"
              >
                Mulai Ulang Timer {DURATION}s
              </button>
              <button onClick={resetAll} className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 transition">
                Reset
              </button>
              {activeStep && (
                <div className="order-3 sm:order-none w-full sm:w-auto sm:ml-auto flex items-center gap-2 mt-3 sm:mt-0">
                  <span className="text-sm text-slate-300">Progress</span>
                  <div className="h-2 w-full sm:w-44 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${activePct}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Recap panel (after a step ends) */}
            {lastRecap && !activeStep && (
              <div className="mt-4 rounded-2xl bg-slate-800/70 backdrop-blur border border-slate-700 p-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Rekap Terakhir — {lastRecap.title}</h3>
                  <div className="flex items-center gap-2">
                    {
                      lastRecap.result === "SUKSES" && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          {lastRecap.result}
                        </span>
                      )
                    }
                    <span className={`text-xs px-2 py-0.5 rounded ${lastRecap.grade === "LULUS" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {lastRecap.grade}
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  <span className="mr-3">Skor terbaik: {lastRecap.best.toFixed(2)}</span>
                  <span className="mr-3">Rata-rata: {lastRecap.avg.toFixed(2)}</span>
                  <span className="mr-3">Selesai @ {lastRecap.finishedAtSec ?? "-"} dtk</span>
                  <span className="mr-3">Ambang: ≤ {lastRecap.ruleWithinSeconds}s & ≥ {lastRecap.ruleMinAvg.toFixed(2)}</span>
                  <span className="mr-3">Frame: {lastRecap.frame}</span>
                  <span className="mr-3">Match: {lastRecap.match}</span>
                </div>
                <div className="mt-3 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-300">
                      <tr>
                        <th className="py-1 pr-4">Detik</th>
                        <th className="py-1">Skor</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {lastRecap.scores.map((s, i) => (
                        <tr key={i} className="border-t border-slate-700/50">
                          <td className="py-1 pr-4">{i + 1}</td>
                          <td className="py-1">{s.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Realtime Log */}
            <div className="mt-4 rounded-2xl bg-slate-800/70 backdrop-blur border border-slate-700 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Log Realtime</h3>
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>Kecerahan:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900/70 border border-slate-700">{avgBrightness}</span>
                  <span className={`px-2 py-0.5 rounded border ${faceDetected ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-slate-900/70 text-slate-300 border-slate-700"}`}>
                    face: {String(faceDetected)}
                  </span>
                  <span className={`px-2 py-0.5 rounded border ${tooDark ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-slate-900/70 text-slate-300 border-slate-700"}`}>
                    dark: {String(tooDark)}
                  </span>
                </div>
              </div>
              <div className="max-h-44 md:max-h-60 overflow-auto divide-y divide-slate-700/60">
                {logs.length === 0 && <div className="text-sm text-slate-400 py-3">Belum ada log.</div>}
                {logs.map((l, idx) => (
                  <div key={idx} className="py-2 flex items-start gap-3">
                    <span
                      className={`text-xs mt-0.5 px-1.5 py-0.5 rounded ${l.level === "success"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : l.level === "warn"
                            ? "bg-amber-500/20 text-amber-300"
                            : l.level === "error"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-slate-600/30 text-slate-300"
                        }`}
                    >
                      {l.time}
                    </span>
                    <div className="text-sm text-slate-200">{l.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Steps panel */}
          <div className="lg:col-span-1 lg:sticky lg:top-4">
            <div className="rounded-2xl bg-slate-800/70 backdrop-blur p-4 border border-slate-700 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Langkah eKYC</h2>
                <span className={`text-xs px-2 py-1 rounded ${cameraReady ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-700 text-slate-300"}`}>
                  Kamera {cameraReady ? "aktif" : "off"}
                </span>
              </div>

              <div className="space-y-3 max-h-[40vh] md:max-h-[60vh] overflow-auto">
                {STEPS.map((s) => {
                  const isActive = activeId === s.id;
                  const done = progress[s.id] >= s.requiredCount;
                  const rule = PASS_RULES[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectStep(s.id)}
                      className={`w-full text-left rounded-xl border p-3 transition relative ${isActive
                          ? "border-sky-400 bg-sky-400/10"
                          : done
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-slate-700 hover:border-slate-600 bg-slate-900/40"
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-xs ${done ? "bg-emerald-500" : isActive ? "bg-sky-500" : "bg-slate-600"
                            }`}
                        >
                          {done ? "✓" : isActive ? "•" : ""}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {s.title}
                            {s.requiredCount > 1 && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-700">Repeat</span>
                            )}
                          </div>
                          <div className="text-slate-300 text-sm">{s.detail}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            Progress: {progress[s.id]} / {s.requiredCount} — Ambang: ≤ {rule.withinSeconds}s & ≥ {rule.minAvg.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Expression box */}
              <div className="mt-4">
                <div className="text-sm mb-1 text-slate-300">Ekspresi Terdeteksi</div>
                <input
                  readOnly
                  className="w-full rounded-xl bg-slate-900/50 border border-slate-700 px-3 py-2 text-slate-200"
                  value={expression}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hidden canvas for sampling */}
        <canvas ref={canvasSampleRef} className="hidden" />
      </div>
    </div>
  );
}
