"use client";
import { JSX, useEffect, useRef, useState } from "react";
import { useFaceApi } from "@/hooks/useFaceApi";

/** ===== Types ===== */
type GestureArah = "lihat_kanan" | "lihat_kiri" | "lihat_atas" | "lihat_bawah";
type GestureEkspresi = "buka_mulut";
type GestureWajib = "kedip" | "geleng_kepala" | "anggukan_kepala";
type Gesture = GestureArah | GestureEkspresi | GestureWajib;

type StepState = {
  id: number;
  gesture: Gesture;
  label: string;
  icon: JSX.Element;
  target: number;   // berapa kali harus terpenuhi (wajib 2-3; bebas 1)
  count: number;    // progres
  mandatory: boolean;
};

/** ===== Config ===== */
const CFG = {
  // Face detector
  minConfidence: 0.45,
  minBrightness: 35,
  tfdInputSize: 320,

  // Head pose (relatif, tanpa kalibrasi manual)
  yawRight: 0.16,
  yawLeft: -0.16,
  // untuk pitch pakai "fusion" → lihat bawah/atas
  pitchUpThr: -0.10,      // fusion < -0.10 ⇒ lihat_atas
  pitchDownThr: 0.14,     // fusion >  0.14 ⇒ lihat_bawah
  deadYaw: 0.06,
  deadPitchFuse: 0.05,    // dead-zone khusus fusion

  // Ekspresi
  marOpen: 0.58,

  // Smoothing/hold
  emaAlpha: 0.15,
  holdFrames: 3,

  // Kedip (EAR) — adaptif
  earMinBlink: 0.15,
  earMinRecover: 0.20,
  earCloseFactor: 0.68,
  earRecoverFactor: 0.90,
  blinkMinDownMs: 70,
  blinkMaxDownMs: 420,
  blinkRefractoryMs: 180,

  // Osilasi (geleng/angguk) pada nilai relatif
  oscMinAmplitude: 0.12,
  oscMinIntervalMs: 160,
  historyLen: 36,

  // Baseline drift (auto-center diam-diam; bukan kalibrasi)
  centerTrackTol: 0.04,   // jika |dev| < tol → baseline pelan2 ikut
  centerAlpha: 0.06,      // kecepatan drift

  // Loop
  targetFps: 25,

  // Wajib repeats
  mandatoryMin: 2,
  mandatoryMax: 3,
};

/** ===== Helpers (geom) ===== */
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mar(p: any[]) {
  const v = dist(p[50], p[58]) + dist(p[51], p[57]) + dist(p[52], p[56]);
  const h = dist(p[48], p[54]);
  return v / (3 * h);
}
function ear(p: any[]) {
  const v1 = dist(p[37], p[41]);
  const v2 = dist(p[38], p[40]);
  const h = dist(p[36], p[39]);
  const earL = (v1 + v2) / (2 * h);
  const v1r = dist(p[43], p[47]);
  const v2r = dist(p[44], p[46]);
  const hr = dist(p[42], p[45]);
  const earR = (v1r + v2r) / (2 * hr);
  return (earL + earR) / 2;
}
function avgPoint(points: any[]) {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}
function estimateBrightness(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  const step = 24;
  for (let i = 0; i < img.length; i += step) {
    const r = img[i], g = img[i + 1], b = img[i + 2];
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return sum / Math.ceil(img.length / step);
}

/** ===== Icons ===== */
const Icon = {
  right: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M10 17l5-5-5-5v10z"/></svg>),
  left: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M14 7l-5 5 5 5V7z"/></svg>),
  up: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M7 14l5-5 5 5H7z"/></svg>),
  down: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M7 10l5 5 5-5H7z"/></svg>),
  mouth: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M12 17c3.31 0 6-2.02 6-4.5V11H6v1.5C6 14.98 8.69 17 12 17z"/></svg>),
  blink: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M12 4C7 4 3.1 7.1 2 12c1.1 4.9 5 8 10 8s8.9-3.1 10-8c-1.1-4.9-5-8-10-8Zm0 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/></svg>),
  shake: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M4 12c4-6 12-6 16 0-4 6-12 6-16 0z"/></svg>),
  nod: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M12 4l4 4h-3v8h-2V8H8l4-4z"/></svg>),
  check: () => (<svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4 5.6 5.6L21 6.9 19.6 5.5z"/></svg>),
};

/** ===== Hints ===== */
const HINT: Record<Gesture, string> = {
  lihat_kanan: "Putar kepala ke KANAN lalu tahan sejenak.",
  lihat_kiri: "Putar kepala ke KIRI lalu tahan sejenak.",
  lihat_atas: "Angkat dagu / lihat ke ATAS.",
  lihat_bawah: "Turunkan dagu / lihat ke BAWAH.",
  buka_mulut: "Buka mulut cukup lebar (gigi terlihat).",
  kedip: "Tutup lalu buka kedua mata (kedip) yang jelas.",
  geleng_kepala: "Goyangkan kepala kiri ↔ kanan beberapa kali.",
  anggukan_kepala: "Anggukkan kepala atas ↔ bawah beberapa kali.",
};

/** ===== Komponen ===== */
export default function EKYCChallengeRandom() {
  const { faceapi, ready, error } = useFaceApi();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI/State
  const [hasFace, setHasFace] = useState(false);
  const [tooDark, setTooDark] = useState(false);
  const [strongestExpression, setStrongestExpression] = useState<string | null>(null);
  const [loadingCam, setLoadingCam] = useState(true);

  // smoothing
  const emaRef = useRef({ yaw: 0, pitch1: 0, pitch2: 0 });
  // drift baseline (diam-diam)
  const centerRef = useRef({ yaw0: 0, pitch2_0: 0 });

  // hold & edge
  const holdRef = useRef({ R: 0, L: 0, U: 0, D: 0 });
  const edgeRef = useRef({ R: false, L: false, U: false, D: false, M: false });

  // Kedip
  const blinkRef = useRef<{ baseline: number | null; isClosed: boolean; downAt: number | null; lastBlinkAt: number | null }>({
    baseline: null, isClosed: false, downAt: null, lastBlinkAt: null
  });

  // Osilasi
  const yawOscRef = useRef<{ lastSign: number; maxAbs: number; lastSwitchAt: number; switches: number; cycles: number; lastCyclesUsed: number }>({
    lastSign: 0, maxAbs: 0, lastSwitchAt: 0, switches: 0, cycles: 0, lastCyclesUsed: 0
  });
  const pitchOscRef = useRef<{ lastSign: number; maxAbs: number; lastSwitchAt: number; switches: number; cycles: number; lastCyclesUsed: number }>({
    lastSign: 0, maxAbs: 0, lastSwitchAt: 0, switches: 0, cycles: 0, lastCyclesUsed: 0
  });

  // Debug HUD
  const [dbg, setDbg] = useState({ ear: 0, base: 0, yaw: 0, p1: 0, p2dev: 0, fuse: 0, yawC: 0, pitC: 0 });

  // Steps (acak)
  const [steps, setSteps] = useState<StepState[]>([]);
  const currentIndex = steps.findIndex(s => s.count < s.target);
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;
  const allDone = currentIndex === -1;

  /** ===== Random steps ===== */
  useEffect(() => {
    const mandatoryPool: GestureWajib[] = ["kedip", "geleng_kepala", "anggukan_kepala"];
    const freePool: (GestureArah | GestureEkspresi)[] = ["lihat_kanan", "lihat_kiri", "lihat_atas", "lihat_bawah", "buka_mulut"];

    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const shuffle = <T,>(arr: T[]) => arr.sort(() => Math.random() - 0.5);

    const wajib = pick(mandatoryPool);
    const target = CFG.mandatoryMin + Math.floor(Math.random() * (CFG.mandatoryMax - CFG.mandatoryMin + 1));
    const freeChoices = shuffle([...freePool]).slice(0, 2);

    const toLabel = (g: Gesture): string => ({
      lihat_kanan: "Lihat ke kanan",
      lihat_kiri: "Lihat ke kiri",
      lihat_atas: "Lihat ke atas",
      lihat_bawah: "Lihat ke bawah",
      buka_mulut: "Buka mulut",
      kedip: "Kedipkan mata",
      geleng_kepala: "Gelengkan kepala",
      anggukan_kepala: "Anggukkan kepala",
    }[g]);

    const toIcon = (g: Gesture): JSX.Element => ({
      lihat_kanan: <Icon.right/>,  lihat_kiri: <Icon.left/>,   lihat_atas: <Icon.up/>,  lihat_bawah: <Icon.down/>,
      buka_mulut: <Icon.mouth/>,   kedip: <Icon.blink/>,       geleng_kepala: <Icon.shake/>, anggukan_kepala: <Icon.nod/>
    }[g]);

    const mandatoryStep: StepState = { id: 1, gesture: wajib, label: toLabel(wajib), icon: toIcon(wajib), target, count: 0, mandatory: true };
    const freeStep1: StepState   = { id: 2, gesture: freeChoices[0] as Gesture, label: toLabel(freeChoices[0] as Gesture), icon: toIcon(freeChoices[0] as Gesture), target: 1, count: 0, mandatory: false };
    const freeStep2: StepState   = { id: 3, gesture: freeChoices[1] as Gesture, label: toLabel(freeChoices[1] as Gesture), icon: toIcon(freeChoices[1] as Gesture), target: 1, count: 0, mandatory: false };

    setSteps(shuffle([mandatoryStep, freeStep1, freeStep2]));
  }, []);

  /** ===== Start camera ===== */
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.setAttribute("playsinline", "");
          v.setAttribute("autoplay", "");
          v.setAttribute("muted", "");
          v.muted = true;
          await v.play().catch(() => {});
          setLoadingCam(false);
        }
      } catch (e: any) {
        setLoadingCam(false);
        console.warn(e?.name || e);
      }
    })();
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | undefined;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** ===== Detection loop ===== */
  useEffect(() => {
    if (!ready || !faceapi) return;
    let raf = 0, lastT = 0;

    const loop = async (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t - lastT < 1000 / CFG.targetFps) return;
      lastT = t;

      const video = videoRef.current, canvas = canvasRef.current;
      if (!video || !canvas) return;

      const ctx = canvas.getContext("2d")!;
      const rect = stageRef.current?.getBoundingClientRect();
      const cw = Math.floor(rect?.width ?? window.innerWidth);
      const ch = Math.floor(rect?.height ?? window.innerHeight);

      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw; canvas.height = ch;
      }

      // draw video (cover)
      drawVideoCover(ctx, video, cw, ch);

      // detect
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: CFG.tfdInputSize, scoreThreshold: CFG.minConfidence }))
        .withFaceLandmarks()
        .withFaceExpressions();

      if (!det) {
        setHasFace(false);
        setStrongestExpression(null);
        const bright = estimateBrightness(ctx, cw, ch);
        setTooDark(bright < CFG.minBrightness);
        return;
      }

      setHasFace(true);
      setTooDark(false);

      // strongest expression
      const expr = Object.entries(det.expressions).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? null;
      setStrongestExpression(expr);

      // box
      const box = mapBoxToCover(video, cw, ch, det.detection.box);
      drawFaceBox(ctx, box);

      const landmarks = det.landmarks.positions as any[];

      // ===== YAW metric (relatif) =====
      const leftEye = avgPoint(landmarks.slice(36, 42));
      const rightEye = avgPoint(landmarks.slice(42, 48));
      const midEyes = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
      const nose = landmarks[30];
      const chin = landmarks[8];
      const centerX = det.detection.box.x + det.detection.box.width / 2;

      let yawRaw = (nose.x - centerX) / det.detection.box.width;   // + kanan

      // ===== PITCH metrics (dua sumber) =====
      // pitch1: nose vs eyes (negatif = ke atas, positif = ke bawah)
      let pitch1 = (nose.y - midEyes.y) / det.detection.box.height;
      // pitch2: eyes vs chin ratio (lebih stabil buat up/down besar)
      let pitch2 = (chin.y - midEyes.y) / det.detection.box.height;

      // smoothing
      const a = CFG.emaAlpha;
      emaRef.current.yaw    = a * yawRaw + (1 - a) * emaRef.current.yaw;
      emaRef.current.pitch1 = a * pitch1 + (1 - a) * emaRef.current.pitch1;
      emaRef.current.pitch2 = a * pitch2 + (1 - a) * emaRef.current.pitch2;
      yawRaw = emaRef.current.yaw;
      pitch1 = emaRef.current.pitch1;
      pitch2 = emaRef.current.pitch2;

      // auto-center (drift) untuk yaw & pitch2 (bukan kalibrasi, pelan & hanya saat tenang)
      if (Math.abs(yawRaw - centerRef.current.yaw0) < CFG.centerTrackTol) {
        centerRef.current.yaw0 += CFG.centerAlpha * (yawRaw - centerRef.current.yaw0);
      }
      if (Math.abs(pitch2 - centerRef.current.pitch2_0) < CFG.centerTrackTol) {
        centerRef.current.pitch2_0 += CFG.centerAlpha * (pitch2 - centerRef.current.pitch2_0);
      }

      const yawEff = yawRaw - centerRef.current.yaw0;
      const pitch2Dev = pitch2 - centerRef.current.pitch2_0;

      // fusion pitch: gabungan dua metrik (70% p1, 30% dev p2), lalu dead-zone
      let pitchFuse = 0.7 * (pitch1) + 0.3 * (pitch2Dev);
      if (Math.abs(pitchFuse) < CFG.deadPitchFuse) pitchFuse = 0;

      // dead-zone yaw
      const yawDz = Math.abs(yawEff) < CFG.deadYaw ? 0 : yawEff;

      // HOLD arah
      const overR = yawDz > CFG.yawRight;
      const overL = yawDz < CFG.yawLeft;
      const overD = pitchFuse > CFG.pitchDownThr;
      const overU = pitchFuse < CFG.pitchUpThr;

      holdRef.current.R = overR ? Math.min(CFG.holdFrames, holdRef.current.R + 1) : 0;
      holdRef.current.L = overL ? Math.min(CFG.holdFrames, holdRef.current.L + 1) : 0;
      holdRef.current.D = overD ? Math.min(CFG.holdFrames, holdRef.current.D + 1) : 0;
      holdRef.current.U = overU ? Math.min(CFG.holdFrames, holdRef.current.U + 1) : 0;

      const lookRight = holdRef.current.R >= CFG.holdFrames;
      const lookLeft  = holdRef.current.L >= CFG.holdFrames;
      const lookDown  = holdRef.current.D >= CFG.holdFrames;
      const lookUp    = holdRef.current.U >= CFG.holdFrames;

      // Mouth open (dengan hold + edge)
      const mouthOpenRaw = mar(landmarks) > CFG.marOpen;
      const mouthHold = RefNum("mouth");
      mouthHold.v = mouthOpenRaw ? Math.min(CFG.holdFrames, mouthHold.v + 1) : 0;
      const mouthOpen = mouthHold.v >= CFG.holdFrames;

      // Kedip (EAR) — adaptif
      const now = performance.now();
      const earVal = ear(landmarks);
      const likelyOpen = earVal > Math.max(CFG.earMinRecover, (blinkRef.current.baseline ?? earVal) * 0.95);
      if (likelyOpen) {
        const b = blinkRef.current.baseline ?? earVal;
        blinkRef.current.baseline = 0.12 * earVal + 0.88 * b;
      }
      const baseline = Math.max(0.001, blinkRef.current.baseline ?? earVal);
      const blinkThresh   = Math.max(CFG.earMinBlink,   baseline * CFG.earCloseFactor);
      const recoverThresh = Math.max(CFG.earMinRecover, baseline * CFG.earRecoverFactor);

      let didBlink = false;
      if (!blinkRef.current.isClosed && earVal < blinkThresh) {
        blinkRef.current.isClosed = true;
        blinkRef.current.downAt = now;
      } else if (blinkRef.current.isClosed && earVal > recoverThresh) {
        const dur = now - (blinkRef.current.downAt ?? now);
        const refractoryOk = !blinkRef.current.lastBlinkAt || (now - blinkRef.current.lastBlinkAt) >= CFG.blinkRefractoryMs;
        if (dur >= CFG.blinkMinDownMs && dur <= CFG.blinkMaxDownMs && refractoryOk) {
          didBlink = true;
          blinkRef.current.lastBlinkAt = now;
        }
        blinkRef.current.isClosed = false;
        blinkRef.current.downAt = null;
      }

      // Osilasi cycles
      updateOscRel(yawDz,   yawOscRef.current,   now);
      updateOscRel(pitchFuse, pitchOscRef.current, now);

      // debug HUD
      setDbg({
        ear: +earVal.toFixed(3),
        base: +baseline.toFixed(3),
        yaw: +yawDz.toFixed(3),
        p1: +pitch1.toFixed(3),
        p2dev: +pitch2Dev.toFixed(3),
        fuse: +pitchFuse.toFixed(3),
        yawC: yawOscRef.current.cycles,
        pitC: pitchOscRef.current.cycles,
      });

      // ===== APPLY to current step =====
      if (!currentStep) return;

      const incStep = (delta = 1) => {
        setSteps(prev => {
          const copy = [...prev];
          const idx = copy.findIndex(s => s.id === currentStep.id);
          if (idx >= 0) {
            const before = copy[idx].count;
            const next = Math.min(copy[idx].target, before + delta);
            if (next !== before) copy[idx] = { ...copy[idx], count: next };
          }
          return copy;
        });
      };

      switch (currentStep.gesture) {
        case "lihat_kanan":
          if (lookRight && !edgeRef.current.R) { incStep(1); edgeRef.current.R = true; }
          if (!lookRight) edgeRef.current.R = false;
          break;
        case "lihat_kiri":
          if (lookLeft && !edgeRef.current.L) { incStep(1); edgeRef.current.L = true; }
          if (!lookLeft) edgeRef.current.L = false;
          break;
        case "lihat_atas":
          if (lookUp && !edgeRef.current.U) { incStep(1); edgeRef.current.U = true; }
          if (!lookUp) edgeRef.current.U = false;
          break;
        case "lihat_bawah":
          if (lookDown && !edgeRef.current.D) { incStep(1); edgeRef.current.D = true; }
          if (!lookDown) edgeRef.current.D = false;
          break;
        case "buka_mulut":
          if (mouthOpen && !edgeRef.current.M) { incStep(1); edgeRef.current.M = true; }
          if (!mouthOpen) edgeRef.current.M = false;
          break;
        case "kedip":
          if (didBlink) incStep(1);
          break;
        case "geleng_kepala": {
          const add = yawOscRef.current.cycles - yawOscRef.current.lastCyclesUsed;
          if (add > 0) {
            incStep(add);
            yawOscRef.current.lastCyclesUsed = yawOscRef.current.cycles;
          }
          break;
        }
        case "anggukan_kepala": {
          const add = pitchOscRef.current.cycles - pitchOscRef.current.lastCyclesUsed;
          if (add > 0) {
            incStep(add);
            pitchOscRef.current.lastCyclesUsed = pitchOscRef.current.cycles;
          }
          break;
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, faceapi, currentStep?.id]);

  // reset per-step
  useEffect(() => {
    perFrameStore.mouth = 0;
    edgeRef.current = { R: false, L: false, U: false, D: false, M: false };
    yawOscRef.current = { lastSign: 0, maxAbs: 0, lastSwitchAt: 0, switches: 0, cycles: 0, lastCyclesUsed: 0 };
    pitchOscRef.current = { lastSign: 0, maxAbs: 0, lastSwitchAt: 0, switches: 0, cycles: 0, lastCyclesUsed: 0 };
  }, [currentStep?.id]);

  // ===== UI =====
  const uiStatus = error ? "Error kamera" : tooDark ? "Pencahayaan kurang" : hasFace ? "Kamera aktif" : "Wajah tidak terdeteksi";

  return (
    <div className="relative w-full min-h-[100svh] text-white overflow-hidden">
      {/* Background premium */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_800px_at_50%_-100px,rgba(56,189,248,0.25),transparent),radial-gradient(1200px_800px_at_50%_120%,rgba(99,102,241,0.25),transparent)] bg-neutral-950" />
      <div className="absolute -top-20 -left-16 w-[420px] h-[420px] rounded-full blur-3xl bg-sky-600/20" />
      <div className="absolute -bottom-24 -right-20 w-[520px] h-[520px] rounded-full blur-3xl bg-indigo-600/20" />

      <div className="relative mx-auto w-full md:max-w-6xl px-4 py-4 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="text-lg md:text-xl font-semibold tracking-tight">Verifikasi Wajah (eKYC)</div>
          <div className="px-3 py-1 rounded-xl border border-white/10 backdrop-blur bg-black/40 text-xs md:text-sm">
            {uiStatus}
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_330px] gap-4 md:gap-6">
          {/* Stage */}
          <div
            ref={stageRef}
            className="relative rounded-2xl md:rounded-3xl overflow-hidden border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] bg-gradient-to-br from-black/40 to-black/20 backdrop-blur min-h-[70svh] md:min-h-[520px]"
          >
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline autoPlay muted />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

            {(loadingCam || !hasFace) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-4 py-3 rounded-xl border border-white/10 bg-black/60 backdrop-blur text-sm md:text-base">
                  {loadingCam ? "Mengaktifkan kamera…" : "Arahkan wajah ke kamera (hindari backlight)."}
                </div>
              </div>
            )}

            {videoRef.current?.paused && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  className="px-4 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition text-sm"
                  onClick={() => videoRef.current?.play().catch(()=>{})}
                >
                  Aktifkan Kamera
                </button>
              </div>
            )}

            {/* Debug HUD */}
            <div className="absolute left-2 bottom-2 text-[10px] md:text-xs px-2 py-1 rounded-md bg-black/50 border border-white/10 whitespace-pre leading-tight">
              EAR {dbg.ear} • BL {dbg.base} | yaw {dbg.yaw} | p1 {dbg.p1} | p2Δ {dbg.p2dev} | fuse {dbg.fuse} | cyc Y {dbg.yawC} P {dbg.pitC}
            </div>

            {/* Hint */}
            {hasFace && currentStep && currentStep.count < currentStep.target && (
              <div className="absolute bottom-3 right-3 max-w-[75%] md:max-w-[60%]">
                <div className="px-3 py-2 rounded-xl border border-white/10 bg-black/60 backdrop-blur text-xs md:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid place-items-center w-6 h-6 rounded-lg bg-white/10 text-white/80">
                      {iconFor(currentStep.gesture)}
                    </span>
                    <div className="leading-tight">
                      <div className="font-medium">
                        {currentStep.label} {currentStep.mandatory ? `( ${currentStep.count}/${currentStep.target} )` : ""}
                      </div>
                      <div className="opacity-80">{HINT[currentStep.gesture]}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Panel kanan */}
          <aside className="relative rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 to-black/20 backdrop-blur p-4 md:p-5">
            <div className="text-sm md:text-base font-medium mb-3">Langkah eKYC (acak)</div>
            <ol className="space-y-2">
              {steps.map((s, i) => {
                const done = s.count >= s.target;
                const active = !done && i === currentIndex;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border
                      ${done ? "border-sky-500/40 bg-sky-500/10" :
                        active ? "border-white/20 bg-white/5" :
                        "border-white/10 bg-white/5"}`}
                  >
                    <span className={`grid place-items-center w-7 h-7 rounded-lg
                      ${done ? "bg-sky-500/20 text-sky-300" : active ? "bg-white/10 text-white/80" : "bg-white/5 text-white/60"}`}>
                      {done ? <Icon.check/> : iconFor(s.gesture)}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm md:text-base">{s.label}{s.mandatory ? " • Wajib" : ""}</div>
                      <div className="text-[11px] md:text-xs opacity-70">
                        Progress: {s.count}/{s.target}
                      </div>
                    </div>
                    {s.mandatory && <span className="text-[11px] md:text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">Repeat</span>}
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 h-px bg-white/10" />

            <div className="mt-4">
              <div className="text-sm md:text-base font-medium mb-2">Ekspresi Terdeteksi</div>
              <div className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm">
                {hasFace ? (strongestExpression ?? "menganalisis…") : "—"}
              </div>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <div className="mt-6 md:mt-8 flex items-center justify-between">
          <div className="text-xs md:text-sm opacity-70">{uiStatus}.</div>
          <div className={`px-3 py-1 rounded-xl text-xs md:text-sm border backdrop-blur
            ${allDone ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5"}`}>
            {allDone ? "Semua challenge terpenuhi ✅" : "Ikuti langkah secara berurutan"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===== helpers UI/logic ===== */
const perFrameStore: Record<string, number> = { mouth: 0 };
function RefNum(key: string) {
  return {
    get v() { return perFrameStore[key] ?? 0; },
    set v(val: number) { perFrameStore[key] = val; }
  };
}

function drawVideoCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, cw: number, ch: number) {
  const vw = video.videoWidth || cw;
  const vh = video.videoHeight || ch;
  const scale = Math.max(cw / vw, ch / vh);
  const sw = vw * scale;
  const sh = vh * scale;
  const dx = (cw - sw) / 2;
  const dy = (ch - sh) / 2;
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(video, dx, dy, sw, sh);
}

function mapBoxToCover(video: HTMLVideoElement, cw: number, ch: number, box: { x: number; y: number; width: number; height: number }) {
  const vw = video.videoWidth || cw;
  const vh = video.videoHeight || ch;
  const scale = Math.max(cw / vw, ch / vh);
  return {
    x: (cw - vw * scale) / 2 + box.x * scale,
    y: (ch - vh * scale) / 2 + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

function drawFaceBox(ctx: CanvasRenderingContext2D, box: any) {
  ctx.save();
  const r = Math.min(box.width, box.height) * 0.08;
  ctx.lineWidth = Math.max(2, Math.min(box.width, box.height) * 0.004);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  roundRect(ctx, box.x, box.y, box.width, box.height, r);
  ctx.stroke();
  // corner brackets
  const c = Math.min(box.width, box.height) * 0.12;
  ctx.lineWidth = Math.max(2, Math.min(box.width, box.height) * 0.003);
  ctx.beginPath();
  // LT
  ctx.moveTo(box.x, box.y + c); ctx.lineTo(box.x, box.y); ctx.lineTo(box.x + c, box.y);
  // RT
  ctx.moveTo(box.x + box.width - c, box.y); ctx.lineTo(box.x + box.width, box.y); ctx.lineTo(box.x + box.width, box.y + c);
  // LB
  ctx.moveTo(box.x, box.y + box.height - c); ctx.lineTo(box.x, box.y + box.height); ctx.lineTo(box.x + c, box.y + box.height);
  // RB
  ctx.moveTo(box.x + box.width - c, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height - c);
  ctx.strokeStyle = "rgba(56,189,248,0.7)";
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function iconFor(g: Gesture) {
  switch (g) {
    case "lihat_kanan": return <Icon.right/>;
    case "lihat_kiri": return <Icon.left/>;
    case "lihat_atas": return <Icon.up/>;
    case "lihat_bawah": return <Icon.down/>;
    case "buka_mulut": return <Icon.mouth/>;
    case "kedip": return <Icon.blink/>;
    case "geleng_kepala": return <Icon.shake/>;
    case "anggukan_kepala": return <Icon.nod/>;
  }
}

/** ===== Oscillation (relative) =====
 * 2 switch tanda = 1 cycle; count hanya saat ada cycle BARU.
 */
function updateOscRel(
  valRel: number,
  ref: { lastSign: number; maxAbs: number; lastSwitchAt: number; switches: number; cycles: number; lastCyclesUsed: number; },
  now: number
) {
  const sign = Math.sign(valRel);
  ref.maxAbs = Math.max(ref.maxAbs, Math.abs(valRel));
  if (sign !== 0 && sign !== ref.lastSign) {
    if (ref.maxAbs >= CFG.oscMinAmplitude && (now - ref.lastSwitchAt) >= CFG.oscMinIntervalMs) {
      ref.switches += 1;
      ref.lastSwitchAt = now;
      if (ref.switches % 2 === 0) ref.cycles += 1; // 2 switch = 1 cycle
    }
    ref.lastSign = sign;
    ref.maxAbs = 0;
  }
}