"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number; t: number; p?: number };
type Stroke = { points: Point[]; color: string; width: number; mode: "pen" | "eraser" };

export default function SignaturePad({
  initialColor = "#111",
  initialWidth = 2,
  className = "",
}: {
  initialColor?: string;
  initialWidth?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [color] = useState(initialColor);
  const [width, setWidth] = useState(initialWidth);
  const [mode, setMode] = useState<"pen" | "eraser">("pen");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const dprRef = useRef(1);
  const rafId = useRef<number | null>(null);
  const queuedEvent = useRef<PointerEvent | null>(null);

  const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    if (s.mode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = s.color;
    }
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      const p = s.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const paintWhiteBackground = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(ctx, s);
    if (current) drawStroke(ctx, current);
    paintWhiteBackground(ctx);
  }, [strokes, current]);

  const applyGridSizeVar = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const grid = Math.round(Math.min(30, Math.max(18, rect.width / 20)));
    wrap.style.setProperty("--grid", `${grid}px`);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    dprRef.current = dpr;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    applyGridSizeVar();
    redraw();
  }, [applyGridSizeVar, redraw]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(() => resize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    const onWindowResize = () => resize();
    const onOrientation = () => resize();
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, [resize]);

  // Properly narrow the event type (no ts-ignore needed)
  const getPos = (e: PointerEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0, clientY = 0, pressure: number | undefined;

    if ("clientX" in e && "clientY" in e) {
      clientX = (e as PointerEvent | MouseEvent).clientX;
      clientY = (e as PointerEvent | MouseEvent).clientY;
      if ("pressure" in e && typeof (e as PointerEvent).pressure === "number") {
        pressure = (e as PointerEvent).pressure;
      }
    } else if ("touches" in e && e.touches[0]) {
      const t = (e as TouchEvent).touches[0];
      clientX = t.clientX;
      clientY = t.clientY;
    }

    const dpr = dprRef.current;
    return {
      x: (clientX - rect.left) * dpr,
      y: (clientY - rect.top) * dpr,
      p: pressure,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    setIsDrawing(true);
    const { x, y, p } = getPos(e.nativeEvent);
    const stroke: Stroke = { points: [{ x, y, t: Date.now(), p }], color, width, mode };
    setCurrent(stroke);
  };

  const pumpMove = () => {
    if (!queuedEvent.current || !isDrawing || !current) return;
    const { x, y, p } = getPos(queuedEvent.current);
    const pt: Point = { x, y, t: Date.now(), p };
    const next = { ...current, points: [...current.points, pt] };
    setCurrent(next);
    redraw();
    rafId.current = null;
    queuedEvent.current = null;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !current) return;
    e.preventDefault();
    queuedEvent.current = e.nativeEvent;
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(pumpMove);
    }
  };

  const onPointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e) e.preventDefault();
    if (current) setStrokes((prev) => [...prev, current]);
    setCurrent(null);
    setIsDrawing(false);
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    queuedEvent.current = null;
  };

  const clear = () => {
    setStrokes([]);
    setCurrent(null);
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    paintWhiteBackground(ctx);
  };

  useEffect(() => {
    redraw();
  }, [strokes, current, redraw]);

  const toPNGDataURL = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    paintWhiteBackground(ctx);
    return canvas.toDataURL("image/png");
  };

  const toSVG = () => {
    const c = canvasRef.current!;
    const w = c.width, h = c.height;
    const dpr = dprRef.current;
    const viewW = Math.round(w / dpr);
    const viewH = Math.round(h / dpr);
    const paths = strokes.map((s) => {
      if (s.points.length < 2) return "";
      const pts = s.points.map((p) => `${(p.x / dpr).toFixed(2)},${(p.y / dpr).toFixed(2)}`).join(" ");
      const strokeAttrs =
        s.mode === "eraser"
          ? `stroke="#ffffff" stroke-width="${(s.width / dpr).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"`
          : `stroke="${s.color}" stroke-width="${(s.width / dpr).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"`;
      return `<polyline fill="none" ${strokeAttrs} points="${pts}" />`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${viewW}" height="${viewH}" viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
<rect width="100%" height="100%" fill="#ffffff"/>
${paths}
</svg>`;
  };

  const download = (type: "png" | "svg") => {
    if (type === "png") {
      const url = toPNGDataURL();
      const a = document.createElement("a");
      a.href = url;
      a.download = "signature.png";
      a.click();
    } else {
      const blob = new Blob([toSVG()], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "signature.svg";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="rounded-2xl bg-white border border-gray-200 p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm font-semibold text-black">TTD Online</span>
          <div className="inline-flex overflow-hidden rounded-xl border border-gray-200">
            <button
              onClick={() => setMode("pen")}
              className={`px-2 sm:px-3 py-2 text-xs sm:text-sm ${mode==="pen" ? "bg-gray-900 text-white" : "bg-white text-gray-800"}`}
            >
              ✎ Pulpen
            </button>
            <button
              onClick={() => setMode("eraser")}
              className={`px-2 sm:px-3 py-2 text-xs sm:text-sm ${mode==="eraser" ? "bg-gray-900 text-white" : "bg-white text-gray-800"}`}
            >
              Hapus
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2 text-gray-500">
            <button onClick={() => setStrokes((p)=>p.slice(0,-1))} className="px-2 sm:px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm hover:bg-gray-50">Undo</button>
            <button onClick={clear} className="px-2 sm:px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm hover:bg-gray-50">Clear</button>
            <button onClick={() => download("png")} className="px-2 sm:px-3 py-2 rounded-xl bg-gray-900 text-white text-xs sm:text-sm">Download</button>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {[2,4,6,8,10,12].map((w) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`px-2 py-1 rounded-lg border text-[10px] sm:text-xs ${width===w?"border-gray-800 text-gray-900":"border-gray-200 text-gray-600"}`}
                title={`ketebalan ${w}px`}
              >
                <span className="inline-block rounded-full" style={{ width: 20, height: w, background: "currentColor" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative w-full rounded-3xl border border-gray-300 bg-white shadow-md overflow-hidden"
        style={{ height: "clamp(14rem, 40vw, 28rem)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-80 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)",
            backgroundSize: "var(--grid, 22px) var(--grid, 22px)",
          }}
        />
        <div className="absolute left-4 sm:left-6 right-4 sm:right-6 bottom-10 h-px bg-gray-400/90" />
        <canvas
          ref={canvasRef}
          className="relative z-10 w-full h-full cursor-crosshair rounded-3xl touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] sm:text-[11px] text-gray-600">
          <span>Mode: <b className="font-medium">{mode === "pen" ? "Pulpen" : "Hapus"}</b> • Ketebalan: <b className="font-medium">{width}px</b></span>
          <span className="hidden md:block">Tips: gunakan stylus/ponsel untuk garis halus</span>
        </div>
      </div>
    </div>
  );
}