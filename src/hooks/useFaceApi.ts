"use client";
import { useEffect, useRef, useState } from "react";

export function useFaceApi() {
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
        if (mounted) setError(e?.message || "Failed to load models");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { faceapi: faceapiRef.current, ready, error } as const;
}