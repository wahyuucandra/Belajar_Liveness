"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Next.js App Router demo using @vladmandic/face-api
 * NO <canvas> USED — overlays are pure HTML elements (div/span) positioned absolutely.
 *
 * Quick start:
 * 1) npm i @vladmandic/face-api
 * 2) Put model files in /public/models (see README of repo for filenames)
 * 3) Save this file as app/face/page.tsx
 * 4) npm run dev and open /face
 */

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold">Next.js + face-api (No Canvas)</h1>
        <p className="text-sm text-gray-600">Real-time detection with HTML overlays only: boxes, 68 landmarks, expressions & pose.</p>
        <FaceDemoNoCanvas />
      </div>
    </div>
  );
}

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
        const modelUrl = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
          faceapi.nets.faceExpressionNet.loadFromUri(modelUrl),
        ]);
        if (mounted) setReady(true);
      } catch (e: any) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load models");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { faceapi: faceapiRef.current, ready, error } as const;
}

// Types for local state
interface Box { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }
interface DetectionHTML {
  box: Box;
  landmarks: Point[]; // 68 points
  expressions: { label: string; score: number }[];
  pose?: { roll: number; pitch: number; yaw: number };
}

function FaceDemoNoCanvas() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [usingCamera, setUsingCamera] = useState(false);
  const [items, setItems] = useState<DetectionHTML[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const lastLogRef = useRef<number>(0); // throttle camera pose logs

  const { faceapi, ready, error } = useFaceApi();

  const options = useMemo(() => {
    if (!faceapi) return null;
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 });
  }, [faceapi]);

  // rAF loop for webcam
  useEffect(() => {
    if (!ready || !faceapi || !options) return;

    let raf = 0;
    const tick = async () => {
      const v = videoRef.current;
      const w = wrapperRef.current;
      if (!v || !w || v.readyState < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }
      try {
        const det = await faceapi
          .detectAllFaces(v, options)
          .withFaceLandmarks()
          .withFaceExpressions();

        const mapped = mapResultsToHTML(det, v.videoWidth, v.videoHeight, w.clientWidth, w.clientHeight);
        const withPose = mapped.map((m) => ({ ...m, pose: estimateHeadPoseFrom68(m.landmarks) }));
        // setItems(withPose);

        // write concise pose + expression to log (throttled every ~800ms)
        const now = performance.now();
        if (now - lastLogRef.current > 2000) {
            const info = withPose
            .map((m, i) => {
              const top = m.expressions?.[0];
              const expr = top ? `${top.label} ${top.score.toFixed(2)}` : "";
          
              const roll = m.pose?.roll ?? 0;
              const pitch = m.pose?.pitch ?? 0;
              const yaw = m.pose?.yaw ?? 0;
          
              let arah = "";
              if (yaw > 15) arah = "hadap kiri";
              else if (yaw < -15) arah = "hadap kanan";
              else if (pitch > 15) arah = "hadap atas";
              else if (pitch < -15) arah = "hadap bawah";
              else arah = "menghadap lurus";
          
              return `#${i + 1} ${expr} ${arah} (R:${roll.toFixed(1)} P:${pitch.toFixed(1)} Y:${yaw.toFixed(1)})`;
            })
            .join(" | ");
          
          setLog((l) => [`Cam: ${withPose.length} face(s) ${info}`, ...l]);
          lastLogRef.current = now;
        }
      } catch (e) {
        // ignore per-frame errors
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, faceapi, options]);

  // One-shot for uploaded image
  useEffect(() => {
    if (!ready || !faceapi || !options) return;
    const img = imgRef.current;
    const w = wrapperRef.current;
    if (!img || !w) return;

    const onLoad = async () => {
      try {
        const det = await faceapi
          .detectAllFaces(img, options)
          .withFaceLandmarks()
          .withFaceExpressions();
        const mapped = mapResultsToHTML(det, img.naturalWidth, img.naturalHeight, w.clientWidth, w.clientHeight);
        const withPose = mapped.map((m) => ({ ...m, pose: estimateHeadPoseFrom68(m.landmarks) }));
        setItems(withPose);
        setLog((l) => [
          `Image: ${det.length} face(s) — ${det
            .map((r: any) => Object.entries(r.expressions).sort((a: any, b: any) => (b[1] as number) - (a[1] as number))[0][0])
            .join(", ")}. Pose: ${withPose
            .map((m: any, i: number) => `#${i + 1} R:${m.pose?.roll.toFixed(1)} P:${m.pose?.pitch.toFixed(1)} Y:${m.pose?.yaw.toFixed(1)}`)
            .join(" | ")}`,
          ...l,
        ]);
      } catch (e: any) {
        setLog((l) => [e?.message || "Detection error", ...l]);
      }
    };

    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [ready, faceapi, options]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setUsingCamera(true);
      setLog((l) => ["Camera started", ...l]);
    } catch (e: any) {
      setLog((l) => [e?.message || "Camera error", ...l]);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setUsingCamera(false);
    setItems([]);
    setLog((l) => ["Camera stopped", ...l]);
  };

  const onImageChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !imgRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") imgRef.current!.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center gap-2 mb-3">
          <button
            className="px-3 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            onClick={startCamera}
            disabled={!ready || usingCamera}
          >
            Start camera
          </button>
          <button
            className="px-3 py-2 rounded-xl bg-gray-200 disabled:opacity-50"
            onClick={stopCamera}
            disabled={!usingCamera}
          >
            Stop
          </button>
          <label className="ml-auto text-sm text-gray-600">
            <input type="file" accept="image/*" onChange={onImageChange} className="hidden" />
            <span className="px-3 py-2 rounded-xl bg-gray-100 cursor-pointer">Upload image</span>
          </label>
        </div>
        {!ready && <div className="text-sm text-gray-600">Loading models…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {/* Display area with absolute HTML overlays */}
        <div ref={wrapperRef} className="relative aspect-video bg-black rounded-xl overflow-hidden">
          {/* Media layers */}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" muted playsInline />
          {/* <img ref={imgRef} alt="uploaded" className="absolute inset-0 w-full h-full object-contain" /> */}

          {/* Overlays — pure HTML */}
          {items.map((it, idx) => (
            <React.Fragment key={idx}>
              {/* Face box */}
              <div
                className="absolute border-2 border-blue-500 rounded-md box-border shadow-sm"
                style={{ left: it.box.x, top: it.box.y, width: it.box.width, height: it.box.height }}
              />

              {/* Landmark points: hidden on camera, visible for images */}
              {!usingCamera && it.landmarks.map((p, i) => (
                <span
                  key={i}
                  className="absolute block rounded-full bg-blue-500/80"
                  style={{ left: p.x - 2, top: p.y - 2, width: 4, height: 4 }}
                />
              ))}

              {/* Expression + Pose label */}
              <div
                className="absolute -translate-y-full px-2 py-1 text-xs rounded-md bg-blue-600 text-white"
                style={{ left: it.box.x, top: it.box.y }}
              >
                {it.expressions[0]?.label} {(it.expressions[0]?.score ?? 0).toFixed(2)}
                {it.pose && (
                  <>
                    <br />R:{it.pose.roll.toFixed(1)} P:{it.pose.pitch.toFixed(1)} Y:{it.pose.yaw.toFixed(1)}
                  </>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <h3 className="font-semibold mb-2">Log</h3>
        <ul className="text-sm text-gray-700 space-y-1 max-h-[60vh] overflow-auto">
          {log.map((l, i) => (
            <li key={i} className="whitespace-pre-wrap">{l}</li>
          ))}
        </ul>
        <div className="mt-4 text-xs text-gray-500">
          Tip: tweak <code>inputSize</code> / <code>scoreThreshold</code> in <code>TinyFaceDetectorOptions</code> for speed vs accuracy.
        </div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------
function mapResultsToHTML(det: any[], srcW: number, srcH: number, dstW: number, dstH: number): DetectionHTML[] {
  // We mimic CSS object-contain letterboxing math to map coords into the drawn box
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let scale = 1;
  let xOffset = 0;
  let yOffset = 0;

  if (srcRatio > dstRatio) {
    // limited by width
    scale = dstW / srcW;
    const usedH = srcH * scale;
    yOffset = (dstH - usedH) / 2;
  } else {
    // limited by height
    scale = dstH / srcH;
    const usedW = srcW * scale;
    xOffset = (dstW - usedW) / 2;
  }

  const mapped: DetectionHTML[] = det.map((d: any) => {
    const box = d.detection.box;
    const expressions = Object.entries(d.expressions)
      .map(([label, score]) => ({ label, score: score as number }))
      .sort((a, b) => b.score - a.score);

    const outBox: Box = {
      x: xOffset + box.x * scale,
      y: yOffset + box.y * scale,
      width: box.width * scale,
      height: box.height * scale,
    };

    const points = d.landmarks.positions as { x: number; y: number }[];
    const outPoints: Point[] = points.map((p) => ({ x: xOffset + p.x * scale, y: yOffset + p.y * scale }));

    return { box: outBox, landmarks: outPoints, expressions };
  });

  return mapped;
}

// Estimate roll/pitch/yaw (approx) from 68 landmarks in 2D space
// Note: heuristic method; for production-grade, prefer solvePnP via opencv.js
function estimateHeadPoseFrom68(pts: Point[]) {
  if (!pts || pts.length < 68) return { roll: 0, pitch: 0, yaw: 0 };
  const L = pts[36]; // left eye outer
  const R = pts[45]; // right eye outer
  const N = pts[30]; // nose tip
  const LM = pts[48]; // mouth left
  const RM = pts[54]; // mouth right

  const dxEye = R.x - L.x;
  const dyEye = R.y - L.y;

  // Roll: angle of eye line
  const roll = (Math.atan2(dyEye, dxEye) * 180) / Math.PI;

  // Midpoints and scales
  const eyeMid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const mouthMid = { x: (LM.x + RM.x) / 2, y: (LM.y + RM.y) / 2 };
  const faceH = Math.hypot(mouthMid.x - eyeMid.x, mouthMid.y - eyeMid.y) || 1;
  const eyeW = Math.hypot(dxEye, dyEye) || 1;

  // Yaw: horizontal offset of nose from eye center relative to eye width
  const yaw = ((N.x - eyeMid.x) / eyeW) * 60; // ~±60° scale

  // Pitch: vertical offset of nose relative to eye->mouth distance
  // negative pitch when looking up (nose closer to eyes), positive when looking down
  const norm = (N.y - eyeMid.y) / faceH; // ~0..1 range
  const pitch = (norm - 0.5) * 90 * -1; // center at ~0, invert so up = negative

  return { roll, pitch, yaw };
}
