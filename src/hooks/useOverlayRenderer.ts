import { useEffect, useRef, useState } from "react";

type FaceApi = {
  TinyFaceDetectorOptions: any;
  detectAllFaces: any;
};
export function useOverlayRenderer(
  faceapi: FaceApi | null,
  faReady: boolean,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  overlayRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const [facesCount, setFacesCount] = useState(0);
  const [expression, setExpression] = useState("neutral");
  const [stats, setStats] = useState({ best: 0, frame: 0, match: 0 });
  const statsRef = useRef({ best: 0, frame: 0, match: 0 });
  const lastStatsUi = useRef(0);
  const MATCH_THRESHOLD = 0.7;

  useEffect(() => {
    const ov = overlayRef.current, video = videoRef.current;
    if (!ov || !video) return;
    const ctx = ov.getContext("2d"); if (!ctx) return;
    let running = true, rafId = 0, lastDetect = 0, inferInFlight = false;

    const ensureSize = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const w = video.clientWidth || video.videoWidth;
      const h = video.clientHeight || video.videoHeight;
      if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
    };
    const drawBaseGuides = (w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const grd = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.2, w/2, h/2, Math.max(w,h)*0.7);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);
    };
    const drawFaceWatermark = (bb: {x:number;y:number;width:number;height:number}, text = "EKYC VERIFIED") => {
      const cx = bb.x + bb.width/2, cy = bb.y + bb.height/2;
      const radius = Math.max(bb.width, bb.height) * 0.65;
      const time = performance.now() / 1000;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(time * 0.6); ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.lineWidth=3;
      ctx.strokeStyle="rgba(56,189,248,0.85)"; ctx.setLineDash([10,8]); ctx.stroke(); ctx.setLineDash([]);
      const repeat = 12; ctx.font = `${Math.max(14, Math.round(bb.width*0.12))}px ui-sans-serif, system-ui`;
      ctx.fillStyle="rgba(255,255,255,0.85)";
      for (let i=0;i<repeat;i++){ const angle=(i/repeat)*Math.PI*2; ctx.save(); ctx.rotate(angle);
        ctx.translate(0,-radius); ctx.rotate(-Math.PI/2); ctx.textAlign="center"; ctx.fillText(text,0,0); ctx.restore();}
      ctx.strokeStyle="rgba(16,185,129,0.95)"; ctx.lineWidth=2;
      ctx.strokeRect(-bb.width/2, -bb.height/2, bb.width, bb.height); ctx.restore();
    };
    const drawLandmarks = (pts?: {x:number;y:number}[]) => {
      if (!pts || pts.length===0) return;
      ctx.save(); ctx.fillStyle="rgba(16,185,129,0.95)";
      for (const p of pts){ ctx.beginPath(); ctx.arc(p.x,p.y,2.5,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    };

    const loop = async () => {
      if (!running) return;
      ensureSize();
      const w = ov.width, h = ov.height;
      drawBaseGuides(w,h);
      const now = performance.now();
      const canInfer = faReady && faceapi && !inferInFlight && now - lastDetect > 80;
      if (canInfer) {
        try {
          inferInFlight = true; lastDetect = now;
          const opts = new (faceapi as any).TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.5 });
          const res = await (faceapi as any)
            .detectAllFaces(video, opts)
            .withFaceLandmarks()
            .withFaceExpressions();
          statsRef.current.frame += 1;
          let bestScoreInFrame = 0;
          setFacesCount(res.length);
          if (res.length) {
            const sorted = res.sort((a:any,b:any)=>b.detection.box.area - a.detection.box.area);
            const best = sorted[0];
            const box = best.detection.box;
            bestScoreInFrame = typeof best.detection.score === "number" ? best.detection.score : 0;
            const pts = best.landmarks?.positions?.map((p:any)=>({x:p.x,y:p.y}));
            const expr = best.expressions || {};
            let topExpr = "neutral", topVal = 0;
            for (const k of Object.keys(expr)) {
              const v = expr[k]; if (typeof v === "number" && v > topVal) { topVal = v; topExpr = k; }
            }
            setExpression(topExpr);
            drawFaceWatermark(box); drawLandmarks(pts);
          }
          if (bestScoreInFrame > statsRef.current.best) statsRef.current.best = bestScoreInFrame;
          if (bestScoreInFrame >= 0.7) statsRef.current.match += 1;
          if (now - lastStatsUi.current > 200) { lastStatsUi.current = now; setStats({...statsRef.current}); }
        } finally { inferInFlight = false; }
      }
      rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => { running = false; cancelAnimationFrame(rafId); };
  }, [faceapi, faReady, overlayRef, videoRef]);

  return { facesCount, expression, stats };
}
