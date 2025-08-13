"use client";
import React, { createContext, useContext, useRef, useState, useCallback } from "react";

type CameraCtx = {
  stream: MediaStream | null;
  ensureStream: (preferFront?: boolean) => Promise<MediaStream>;
  stop: () => void;
};

const Ctx = createContext<CameraCtx | null>(null);

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const streamRef = useRef<MediaStream | null>(null);
  const [streamState, setStreamState] = useState<MediaStream | null>(null);

  const ensureStream = useCallback(async (preferFront = true) => {
    if (streamRef.current && streamRef.current.getVideoTracks().some(t => t.readyState === "live")) {
      return streamRef.current;
    }
    if (!window.isSecureContext) throw new Error("Akses kamera butuh HTTPS.");
    const gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!gum) throw new Error("Browser tidak mendukung getUserMedia.");

    let s: MediaStream;
    try {
      s = await gum({ video: { facingMode: preferFront ? "user" : "environment" }, audio: false });
    } catch {
      s = await gum({ video: true, audio: false });
    }
    streamRef.current = s;
    setStreamState(s);
    return s;
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStreamState(null);
  }, []);

  return <Ctx.Provider value={{ stream: streamState, ensureStream, stop }}>{children}</Ctx.Provider>;
}

export function useCamera() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCamera harus dipakai di dalam <CameraProvider>");
  return ctx;
}